<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Models\KpiCompanyTarget;
use App\Models\KpiTeamTarget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KpiTeamController extends Controller
{
    use ApiResponse;

    public function companyTarget(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        $target = KpiCompanyTarget::where('year', $year)->first();

        return $this->success($target ? [
            'year' => $target->year,
            'target_amount' => $target->target_amount,
        ] : null);
    }

    public function saveCompanyTarget(Request $request): JsonResponse
    {
        $v = $request->validate([
            'year' => 'required|integer|min:2020|max:2100',
            'target_amount' => 'required|integer|min:0',
        ]);

        $target = KpiCompanyTarget::updateOrCreate(
            ['year' => $v['year']],
            ['target_amount' => $v['target_amount']]
        );

        return $this->success(['year' => $target->year, 'target_amount' => $target->target_amount]);
    }

    public function teamTargets(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        $targets = KpiTeamTarget::where('year', $year)->orderBy('team_name')->get()
            ->map(fn ($t) => $this->mapRecord($t));

        return $this->success($targets);
    }

    public function storeTeamTarget(Request $request): JsonResponse
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

        // Chan tao team target "mo coi" khi nam do chua co target tong — phai nhap target tong truoc
        // (khop luong UI: bang team bi an cho tuong nam chua co target tong).
        if (! KpiCompanyTarget::where('year', $v['year'])->exists()) {
            return $this->error('MISSING_COMPANY_TARGET', 'Chưa có target tổng công ty cho năm này — nhập target tổng trước.', 422);
        }

        $target = KpiTeamTarget::create([
            'year' => $v['year'],
            'team_id' => $v['team_id'],
            'team_name' => $v['team_name'],
            'q1' => $v['q1'] ?? 0,
            'q2' => $v['q2'] ?? 0,
            'q3' => $v['q3'] ?? 0,
            'q4' => $v['q4'] ?? 0,
        ]);

        return $this->success($this->mapRecord($target), [], 201);
    }

    public function updateTeamTarget(Request $request, int $id): JsonResponse
    {
        $v = $request->validate([
            'q1' => 'nullable|integer|min:0',
            'q2' => 'nullable|integer|min:0',
            'q3' => 'nullable|integer|min:0',
            'q4' => 'nullable|integer|min:0',
        ]);

        $target = KpiTeamTarget::findOrFail($id);
        $target->update([
            'q1' => $v['q1'] ?? 0,
            'q2' => $v['q2'] ?? 0,
            'q3' => $v['q3'] ?? 0,
            'q4' => $v['q4'] ?? 0,
        ]);

        return $this->success($this->mapRecord($target));
    }

    public function destroyTeamTarget(int $id): JsonResponse
    {
        KpiTeamTarget::destroy($id);

        return $this->success(null);
    }

    private function mapRecord(KpiTeamTarget $t): array
    {
        return [
            'id' => $t->id,
            'year' => $t->year,
            'team_id' => $t->team_id,
            'team_name' => $t->team_name,
            'q1' => $t->q1,
            'q2' => $t->q2,
            'q3' => $t->q3,
            'q4' => $t->q4,
        ];
    }
}
