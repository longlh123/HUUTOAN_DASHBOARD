<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Models\KpiTarget;
use App\Services\Crm\SalesPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KpiController extends Controller
{
    use ApiResponse;

    public function __construct(private SalesPerformanceService $sales) {}

    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        $targets = KpiTarget::where('year', $year)->get()->map(fn ($t) => $this->mapRecord($t));

        return $this->success($targets);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'crm_user_id' => 'required|string|max:36',
            'user_name' => 'required|string|max:255',
            'team_id' => 'required|string|max:36',
            'team_name' => 'required|string|max:255',
            'year' => 'required|integer|min:2020|max:2100',
            'q1' => 'nullable|integer|min:0',
            'q2' => 'nullable|integer|min:0',
            'q3' => 'nullable|integer|min:0',
            'q4' => 'nullable|integer|min:0',
        ]);

        $target = KpiTarget::create([
            'crm_user_id' => $v['crm_user_id'],
            'user_name' => $v['user_name'],
            'team_id' => $v['team_id'],
            'team_name' => $v['team_name'],
            'year' => $v['year'],
            'q1' => $v['q1'] ?? 0,
            'q2' => $v['q2'] ?? 0,
            'q3' => $v['q3'] ?? 0,
            'q4' => $v['q4'] ?? 0,
        ]);

        return $this->success($this->mapRecord($target), [], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $v = $request->validate([
            'year' => 'required|integer|min:2020|max:2100',
            'team_id' => 'required|string|max:36',
            'team_name' => 'required|string|max:255',
            'q1' => 'nullable|integer|min:0',
            'q2' => 'nullable|integer|min:0',
            'q3' => 'nullable|integer|min:0',
            'q4' => 'nullable|integer|min:0',
        ]);

        $target = KpiTarget::where('crm_user_id', $id)->where('year', $v['year'])->firstOrFail();
        $target->update([
            'team_id' => $v['team_id'],
            'team_name' => $v['team_name'],
            'q1' => $v['q1'] ?? 0,
            'q2' => $v['q2'] ?? 0,
            'q3' => $v['q3'] ?? 0,
            'q4' => $v['q4'] ?? 0,
        ]);

        return $this->success($this->mapRecord($target));
    }

    public function performance(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        return $this->success($this->sales->kpiPerformance($year));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        KpiTarget::where('crm_user_id', $id)->where('year', $year)->delete();

        return $this->success(null);
    }

    private function mapRecord(KpiTarget $t): array
    {
        return [
            'id' => $t->crm_user_id,
            'crm_user_id' => $t->crm_user_id,
            'user_name' => $t->user_name,
            'team_id' => $t->team_id,
            'team_name' => $t->team_name,
            'year' => $t->year,
            'q1' => $t->q1,
            'q2' => $t->q2,
            'q3' => $t->q3,
            'q4' => $t->q4,
        ];
    }
}
