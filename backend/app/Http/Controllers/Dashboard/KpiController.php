<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Crm\CrmApiService;
use App\Services\Crm\SalesPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KpiController extends Controller
{
    use ApiResponse;

    public function __construct(
        private CrmApiService $crm,
        private SalesPerformanceService $sales,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        $raw = $this->crm->get('crc83_kpitargetses', [
            '$select' => 'crc83_ab_year,crc83_ab_q1,crc83_ab_q2,crc83_ab_q3,crc83_ab_q4,_crc83_ab_user_value',
            '$filter' => "crc83_ab_year eq {$year}",
        ]);

        $targets = collect($raw['value'] ?? [])->map(fn ($r) => $this->mapRecord($r));

        return $this->success($targets);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'crm_user_id' => 'required|string|max:36',
            'user_name'   => 'required|string|max:255',
            'year'        => 'required|integer|min:2020|max:2100',
            'q1'          => 'nullable|integer|min:0',
            'q2'          => 'nullable|integer|min:0',
            'q3'          => 'nullable|integer|min:0',
            'q4'          => 'nullable|integer|min:0',
        ]);

        $id = $this->crm->post('crc83_kpitargetses', [
            'crc83_ab_user@odata.bind' => "/systemusers({$v['crm_user_id']})",
            'crc83_ab_year'            => $v['year'],
            'crc83_ab_q1'              => $v['q1'] ?? 0,
            'crc83_ab_q2'              => $v['q2'] ?? 0,
            'crc83_ab_q3'              => $v['q3'] ?? 0,
            'crc83_ab_q4'              => $v['q4'] ?? 0,
        ]);

        return $this->success([
            'id'          => $v['crm_user_id'],
            'crm_user_id' => $v['crm_user_id'],
            'user_name'   => $v['user_name'],
            'year'        => $v['year'],
            'q1'          => $v['q1'],
            'q2'          => $v['q2'],
            'q3'          => $v['q3'],
            'q4'          => $v['q4'],
        ], [], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $v = $request->validate([
            'year' => 'required|integer|min:2020|max:2100',
            'q1'   => 'nullable|integer|min:0',
            'q2'   => 'nullable|integer|min:0',
            'q3'   => 'nullable|integer|min:0',
            'q4'   => 'nullable|integer|min:0',
        ]);

        $altKey = "_crc83_ab_user_value={$id},crc83_ab_year={$v['year']}";

        $this->crm->patch('crc83_kpitargetses', $altKey, [
            'crc83_ab_q1' => $v['q1'] ?? 0,
            'crc83_ab_q2' => $v['q2'] ?? 0,
            'crc83_ab_q3' => $v['q3'] ?? 0,
            'crc83_ab_q4' => $v['q4'] ?? 0,
        ]);

        $raw = $this->crm->get("crc83_kpitargetses({$altKey})", [
            '$select' => 'crc83_ab_year,crc83_ab_q1,crc83_ab_q2,crc83_ab_q3,crc83_ab_q4,_crc83_ab_user_value',
        ]);

        return $this->success($this->mapRecord($raw));
    }

    public function performance(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);
        return $this->success($this->sales->kpiPerformance($year));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $year   = (int) $request->query('year', now()->year);
        $altKey = "_crc83_ab_user_value={$id},crc83_ab_year={$year}";

        $this->crm->delete('crc83_kpitargetses', $altKey);

        return $this->success(null);
    }

    private function mapRecord(array $r): array
    {
        $userId = $r['_crc83_ab_user_value'] ?? '';
        return [
            'id'          => $userId,
            'crm_user_id' => $userId,
            'user_name'   => $r['_crc83_ab_user_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            'year'        => $r['crc83_ab_year'],
            'q1'          => $r['crc83_ab_q1'] ?? null,
            'q2'          => $r['crc83_ab_q2'] ?? null,
            'q3'          => $r['crc83_ab_q3'] ?? null,
            'q4'          => $r['crc83_ab_q4'] ?? null,
        ];
    }
}
