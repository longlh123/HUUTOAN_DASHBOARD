<?php

namespace App\Console\Commands;

use App\Services\Crm\CrmApiService;
use Illuminate\Console\Command;

class CrmAnalyzeDeviceGps extends Command
{
    protected $signature   = 'crm:analyze-device-gps';
    protected $description = 'Phân tích GPS thiết bị: coverage + khoảng cách đến trạm BH gần nhất';

    public function __construct(private CrmApiService $api) {
        parent::__construct();
    }

    public function handle(): void
    {
        $this->info("\n📡 Đang tải dữ liệu trạm bảo hành...");
        $centers = $this->loadServiceCenters();
        $this->line('  → ' . count($centers) . ' trạm BH có GPS');

        $this->info("\n📦 Đang tải thiết bị (tất cả)...");
        $devices = $this->loadDevices();
        $this->line('  → ' . count($devices) . ' thiết bị tổng cộng');

        // ── Phân loại GPS ──────────────────────────────────────────────────
        $hasGps    = array_filter($devices, fn($d) => $d['lat'] && $d['lng']);
        $noGps     = array_filter($devices, fn($d) => !$d['lat'] || !$d['lng']);
        $hasAssign = array_filter($devices, fn($d) => $d['refer_unit_id']);

        $this->info("\n═══════════════════════════════════════════");
        $this->info("  TỔNG QUAN GPS THIẾT BỊ");
        $this->info("═══════════════════════════════════════════");
        $this->line(sprintf('  Tổng thiết bị:            %d', count($devices)));
        $this->line(sprintf('  ✅ Có GPS (lat/lng != 0):  %d  (%.1f%%)',
            count($hasGps), count($devices) ? count($hasGps) / count($devices) * 100 : 0));
        $this->line(sprintf('  ❌ Không có GPS:           %d  (%.1f%%)',
            count($noGps), count($devices) ? count($noGps) / count($devices) * 100 : 0));
        $this->line(sprintf('  🏢 Đã gán trạm phụ trách: %d  (%.1f%%)',
            count($hasAssign), count($devices) ? count($hasAssign) / count($devices) * 100 : 0));

        // ── Phân tích thiết bị có GPS ──────────────────────────────────────
        if (count($hasGps) === 0 || count($centers) === 0) {
            $this->warn("\n  Không đủ dữ liệu để tính khoảng cách.");
            return;
        }

        $this->info("\n═══════════════════════════════════════════");
        $this->info("  PHÂN TÍCH KHOẢNG CÁCH (thiết bị có GPS)");
        $this->info("═══════════════════════════════════════════");

        $nearestCount    = array_fill_keys(array_column($centers, 'name'), 0);
        $assignedCount   = array_fill_keys(array_column($centers, 'name'), 0);
        $distances       = [];
        $mismatchCount   = 0;
        $mismatchSamples = [];

        foreach ($hasGps as $d) {
            $nearest = $this->nearestCenter($d['lat'], $d['lng'], $centers);
            $nearestCount[$nearest['name']] = ($nearestCount[$nearest['name']] ?? 0) + 1;
            $distances[] = $nearest['distance'];

            if ($d['refer_unit_name']) {
                $assignedCount[$d['refer_unit_name']] = ($assignedCount[$d['refer_unit_name']] ?? 0) + 1;

                if ($d['refer_unit_name'] !== $nearest['name']) {
                    $mismatchCount++;
                    if (count($mismatchSamples) < 10) {
                        $mismatchSamples[] = [
                            'device'    => $d['name'],
                            'customer'  => $d['customer'],
                            'assigned'  => $d['refer_unit_name'],
                            'nearest'   => $nearest['name'],
                            'dist_km'   => round($nearest['distance'], 1),
                            'city'      => $d['city'],
                        ];
                    }
                }
            }
        }

        // Thống kê khoảng cách
        sort($distances);
        $avg    = array_sum($distances) / count($distances);
        $median = $distances[(int)(count($distances) / 2)];
        $max    = max($distances);
        $min    = min($distances);

        $this->line(sprintf("\n  Khoảng cách đến trạm gần nhất (km):"));
        $this->line(sprintf('    Min:    %.1f km', $min));
        $this->line(sprintf('    Median: %.1f km', $median));
        $this->line(sprintf('    Avg:    %.1f km', $avg));
        $this->line(sprintf('    Max:    %.1f km', $max));

        // Trạm gần nhất vs trạm được gán
        $this->info("\n  TRẠM GẦN NHẤT (theo GPS)  vs  TRẠM ĐƯỢC GÁN TRONG CRM:");
        $this->line(sprintf('  %-50s %10s %10s', 'Trạm BH', 'Gần nhất', 'Được gán'));
        $this->line(str_repeat('─', 74));
        foreach ($centers as $c) {
            $n = $nearestCount[$c['name']] ?? 0;
            $a = $assignedCount[$c['name']] ?? 0;
            $flag = ($n > 0 || $a > 0) ? '' : '  (0 thiết bị)';
            $this->line(sprintf('  %-50s %10d %10d%s', $c['name'], $n, $a, $flag));
        }

        // Thiết bị gán sai trạm
        if ($mismatchCount > 0) {
            $hasAssignWithGps = array_filter($hasGps, fn($d) => $d['refer_unit_name']);
            $mismatchPct = count($hasAssignWithGps) > 0
                ? $mismatchCount / count($hasAssignWithGps) * 100 : 0;

            $this->info(sprintf("\n  ⚠️  THIẾT BỊ GÁN SAI TRẠM: %d / %d có GPS+gán trạm (%.1f%%)",
                $mismatchCount, count($hasAssignWithGps), $mismatchPct));
            $this->line("  (Trạm gần nhất theo GPS ≠ trạm được gán trong CRM)\n");

            $this->line(sprintf('  %-30s %-25s %-35s %-35s %8s',
                'Thiết bị', 'Tỉnh/Thành', 'Trạm gán trong CRM', 'Trạm gần nhất', 'Dist km'));
            $this->line(str_repeat('─', 140));
            foreach ($mismatchSamples as $s) {
                $this->line(sprintf('  %-30s %-25s %-35s %-35s %8.1f',
                    substr($s['device'], 0, 29),
                    substr($s['city'], 0, 24),
                    substr($s['assigned'], 0, 34),
                    substr($s['nearest'], 0, 34),
                    $s['dist_km']));
            }
            if ($mismatchCount > 10) {
                $this->line("  ... và " . ($mismatchCount - 10) . " thiết bị khác");
            }
        } else {
            $this->info("\n  ✅ Tất cả thiết bị có GPS đều được gán đúng trạm gần nhất.");
        }

        // Thiết bị không GPS phân theo tỉnh
        $this->info("\n═══════════════════════════════════════════");
        $this->info("  THIẾT BỊ KHÔNG CÓ GPS — phân theo tỉnh/thành");
        $this->info("═══════════════════════════════════════════");
        $byCity = [];
        foreach ($noGps as $d) {
            $city = $d['city'] ?: 'Chưa có địa chỉ';
            $byCity[$city] = ($byCity[$city] ?? 0) + 1;
        }
        arsort($byCity);
        $shown = 0;
        foreach ($byCity as $city => $cnt) {
            $this->line(sprintf('  %-40s %d', $city, $cnt));
            if (++$shown >= 20) { $this->line('  ...'); break; }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function loadServiceCenters(): array
    {
        $data = $this->api->get('msdyn_organizationalunits', [
            '$select' => 'msdyn_organizationalunitid,msdyn_name,msdyn_latitude,msdyn_longitude,statecode',
            '$filter' => 'statecode eq 0',
        ]);

        $centers = [];
        foreach ($data['value'] ?? [] as $r) {
            $lat = (float) ($r['msdyn_latitude'] ?? 0);
            $lng = (float) ($r['msdyn_longitude'] ?? 0);
            if (!$lat || !$lng) continue;
            $centers[] = ['id' => $r['msdyn_organizationalunitid'], 'name' => $r['msdyn_name'], 'lat' => $lat, 'lng' => $lng];
        }
        return $centers;
    }

    private function loadDevices(): array
    {
        $records = $this->api->getAll('ab_devices', [
            '$select'  => implode(',', [
                'ab_deviceid', 'ab_name',
                'ab_latitude', 'ab_longitude',
                'ab_distance_km',
                '_ab_refer_organizational_unit_id_value',
                '_ab_current_owner_id_value',
                '_ab_city_id_value',
                '_ab_state_id_value',
            ]),
            '$filter'  => 'statecode eq 0',
            '$orderby' => 'createdon desc',
        ]);

        return array_map(function ($r) {
            $lat = (float) ($r['ab_latitude']  ?? 0);
            $lng = (float) ($r['ab_longitude'] ?? 0);
            return [
                'id'             => $r['ab_deviceid'],
                'name'           => $r['ab_name'] ?? '',
                'lat'            => (abs($lat) > 0.001) ? $lat : null,
                'lng'            => (abs($lng) > 0.001) ? $lng : null,
                'distance_crm'   => $r['ab_distance_km'] ?? null,
                'refer_unit_id'  => $r['_ab_refer_organizational_unit_id_value'] ?? null,
                'refer_unit_name'=> $r['_ab_refer_organizational_unit_id_value@OData.Community.Display.V1.FormattedValue'] ?? null,
                'customer'       => $r['_ab_current_owner_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'city'           => $r['_ab_city_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'state'          => $r['_ab_state_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            ];
        }, $records);
    }

    private function nearestCenter(float $lat, float $lng, array $centers): array
    {
        $nearest = null;
        $minDist = PHP_FLOAT_MAX;
        foreach ($centers as $c) {
            $d = $this->haversine($lat, $lng, $c['lat'], $c['lng']);
            if ($d < $minDist) { $minDist = $d; $nearest = $c; }
        }
        return array_merge($nearest, ['distance' => $minDist]);
    }

    private function haversine(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R    = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a    = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
