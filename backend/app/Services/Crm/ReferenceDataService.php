<?php

namespace App\Services\Crm;

use Illuminate\Support\Collection;
use InvalidArgumentException;

class ReferenceDataService
{
    public function __construct(private CrmApiService $api) {}

    private const TABLES = [
        'city' => [
            'label' => 'Tỉnh / Thành phố',
            'logical_name' => 'ab_city',
            'entity_set' => 'ab_cities',
            'id_field' => 'ab_cityid',
            'fields' => [
                ['key' => 'ab_name', 'label' => 'Tên', 'type' => 'text'],
                ['key' => 'ab_code', 'label' => 'Mã GSO', 'type' => 'text'],
                ['key' => 'ab_organization_unit_id', 'label' => 'Trạm bảo hành', 'type' => 'lookup', 'lookup_table' => 'org_unit'],
                ['key' => 'statecode', 'label' => 'Trạng thái', 'type' => 'select', 'badge' => true, 'options' => [0 => 'Active', 1 => 'Inactive']],
            ],
        ],
        'district' => [
            'label' => 'Xã / Phường',
            'logical_name' => 'ab_district',
            'entity_set' => 'ab_districts',
            'id_field' => 'ab_districtid',
            'fields' => [
                ['key' => 'ab_name', 'label' => 'Tên', 'type' => 'text'],
                ['key' => 'ab_code', 'label' => 'Mã GSO', 'type' => 'text'],
                ['key' => 'ab_city_id', 'label' => 'Thuộc Tỉnh/TP', 'type' => 'lookup', 'lookup_table' => 'city'],
                ['key' => 'statecode', 'label' => 'Trạng thái', 'type' => 'select', 'badge' => true, 'options' => [0 => 'Active', 1 => 'Inactive']],
            ],
        ],
        'setting' => [
            'label' => 'Setting Master',
            'logical_name' => 'ab_setting_master',
            'entity_set' => 'ab_setting_masters',
            'id_field' => 'ab_setting_masterid',
            'fields' => [
                ['key' => 'ab_name', 'label' => 'Name', 'type' => 'text'],
                ['key' => 'ab_id', 'label' => 'ID', 'type' => 'text', 'readonly' => true],
                ['key' => 'ab_value', 'label' => 'Value', 'type' => 'text'],
            ],
        ],
        'org_unit' => [
            'label' => 'Trạm bảo hành',
            'logical_name' => 'msdyn_organizationalunit',
            'entity_set' => 'msdyn_organizationalunits',
            'id_field' => 'msdyn_organizationalunitid',
            'fields' => [
                ['key' => 'msdyn_name', 'label' => 'Tên trạm', 'type' => 'text'],
                ['key' => 'msdyn_latitude', 'label' => 'Latitude', 'type' => 'text'],
                ['key' => 'msdyn_longitude', 'label' => 'Longitude', 'type' => 'text'],
                ['key' => 'msdyn_address1', 'label' => 'Địa chỉ', 'type' => 'text'],
                ['key' => 'msdyn_stateorprovince', 'label' => 'Tỉnh/TP', 'type' => 'text_select', 'lookup_table' => 'city'],
                ['key' => 'msdyn_city', 'label' => 'Quận/Huyện', 'type' => 'text_select', 'lookup_table' => 'district', 'depends_on' => 'msdyn_stateorprovince', 'depends_on_match' => 'ab_city_id_label'],
                ['key' => 'statecode', 'label' => 'Trạng thái', 'type' => 'select', 'badge' => true, 'options' => [0 => 'Active', 1 => 'Inactive']],
            ],
        ],
    ];

    public function tables(): array
    {
        return collect(self::TABLES)->map(fn ($def, $key) => [
            'key' => $key,
            'label' => $def['label'],
            'logical_name' => $def['logical_name'],
        ])->values()->all();
    }

    public function schema(string $table): array
    {
        $def = $this->definition($table);

        return [
            'key' => $table,
            'label' => $def['label'],
            'logical_name' => $def['logical_name'],
            'fields' => $def['fields'],
        ];
    }

    public function list(string $table, ?string $filterField = null, ?string $filterValue = null): Collection
    {
        $def = $this->definition($table);
        $select = array_unique(array_merge([$def['id_field']], array_map(fn ($f) => $this->selectKey($f), $def['fields'])));
        $params = ['$select' => implode(',', $select)];

        if ($filterField !== null && $filterValue !== null) {
            $field = collect($def['fields'])->firstWhere('key', $filterField);
            $key = ($field && $field['type'] === 'lookup') ? "_{$filterField}_value" : $filterField;
            $params['$filter'] = "{$key} eq {$filterValue}";

            $rows = $this->api->getAll($def['entity_set'], $params);

            return collect($rows)->map(fn ($row) => $this->mapRow($def, $row));
        }

        $rows = cache()->remember("crm:reference_data:{$table}:list", 300, fn () => $this->api->getAll($def['entity_set'], $params));

        return collect($rows)->map(fn ($row) => $this->mapRow($def, $row));
    }

    public function options(string $table): array
    {
        $def = $this->definition($table);
        $nameField = $this->firstTextField($def);
        $lookupFields = array_values(array_filter($def['fields'], fn ($f) => $f['type'] === 'lookup'));

        $select = array_unique(array_merge([$def['id_field'], $nameField], array_map(fn ($f) => $this->selectKey($f), $lookupFields)));

        $rows = cache()->remember("crm:reference_data:{$table}:options", 300, fn () => $this->api->getAll($def['entity_set'], [
            '$select' => implode(',', $select),
        ]));

        return collect($rows)->map(function ($row) use ($def, $nameField, $lookupFields) {
            $item = [
                'id' => $row[$def['id_field']],
                'label' => $row[$nameField] ?? '',
            ];

            foreach ($lookupFields as $f) {
                $item["{$f['key']}_label"] = $row["_{$f['key']}_value@OData.Community.Display.V1.FormattedValue"] ?? '';
            }

            return $item;
        })->values()->all();
    }

    public function create(string $table, array $payload): string
    {
        $def = $this->definition($table);
        $id = $this->api->post($def['entity_set'], $this->buildBody($def, $payload));

        $this->forgetCache($table);

        return $id;
    }

    public function update(string $table, string $id, array $payload): void
    {
        $def = $this->definition($table);
        $body = $this->buildBody($def, $payload);

        if (! empty($body)) {
            $this->api->patch($def['entity_set'], $id, $body);
            $this->forgetCache($table);
        }
    }

    private function forgetCache(string $table): void
    {
        cache()->forget("crm:reference_data:{$table}:list");
        cache()->forget("crm:reference_data:{$table}:options");
    }

    private function buildBody(array $def, array $payload): array
    {
        $body = [];

        foreach ($def['fields'] as $field) {
            if (! array_key_exists($field['key'], $payload) || ! empty($field['readonly'])) {
                continue;
            }

            $value = $payload[$field['key']];

            if ($field['type'] === 'lookup') {
                if (empty($value)) {
                    continue;
                }
                $lookupDef = $this->definition($field['lookup_table']);
                $body["{$field['key']}@odata.bind"] = "/{$lookupDef['entity_set']}({$value})";

                continue;
            }

            if ($field['key'] === 'statecode') {
                // D365 doi hoi statuscode di kem statecode — mapping don gian Active(0)/Inactive(1).
                $body['statecode'] = (int) $value;
                $body['statuscode'] = (int) $value === 0 ? 1 : 2;

                continue;
            }

            $body[$field['key']] = $value;
        }

        return $body;
    }

    private function definition(string $table): array
    {
        if (! isset(self::TABLES[$table])) {
            throw new InvalidArgumentException("Bảng '{$table}' không có trong whitelist Reference Data.");
        }

        return self::TABLES[$table];
    }

    private function selectKey(array $field): string
    {
        return $field['type'] === 'lookup' ? "_{$field['key']}_value" : $field['key'];
    }

    private function firstTextField(array $def): string
    {
        foreach ($def['fields'] as $field) {
            if ($field['type'] === 'text') {
                return $field['key'];
            }
        }

        return $def['fields'][0]['key'];
    }

    private function mapRow(array $def, array $row): array
    {
        $out = ['id' => $row[$def['id_field']]];

        foreach ($def['fields'] as $field) {
            $key = $field['key'];

            if ($field['type'] === 'lookup') {
                $out[$key] = $row["_{$key}_value"] ?? null;
                $out["{$key}_label"] = $row["_{$key}_value@OData.Community.Display.V1.FormattedValue"] ?? '';

                continue;
            }

            $out[$key] = $row[$key] ?? null;

            if ($field['type'] === 'select') {
                $out["{$key}_label"] = $field['options'][$row[$key] ?? null] ?? '';
            }
        }

        return $out;
    }
}
