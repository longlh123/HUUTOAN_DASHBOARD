<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Models\User;
use App\Services\Crm\CrmApiService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\JsonResponse;
use Laravel\Socialite\Facades\Socialite;

class AzureAuthController extends Controller
{
    use ApiResponse;

    public function __construct(private CrmApiService $crm) {}

    public function redirect(): RedirectResponse
    {
        return Socialite::driver('azure')->redirect();
    }

    public function callback(): RedirectResponse
    {
        $azureUser = Socialite::driver('azure')->user();

        [$territory, $department] = $this->lookupUserProfile($azureUser->getEmail());
        $isAdmin                  = $territory === null;

        $user = User::updateOrCreate(
            ['azure_id' => $azureUser->getId()],
            [
                'name'       => $azureUser->getName(),
                'email'      => $azureUser->getEmail(),
                'territory'  => $territory,
                'department' => $department,
                'is_admin'   => $isAdmin,
            ]
        );

        $token = $user->createToken('dashboard')->plainTextToken;

        $frontendUrl = env('FRONTEND_URL', 'http://localhost:5173');

        return redirect("{$frontendUrl}/auth/callback?token={$token}");
    }

    public function me(): JsonResponse
    {
        $user = request()->user();

        return $this->success([
            'id'         => $user->id,
            'name'       => $user->name,
            'email'      => $user->email,
            'territory'  => $user->territory,
            'department' => $user->department,
            'is_admin'   => $user->is_admin,
        ]);
    }

    // Lookup territory + department từ D365 systemusers theo email
    // Returns [territory|null, department|null]
    private function lookupUserProfile(string $email): array
    {
        try {
            $result = $this->crm->get('systemusers', [
                '$select' => 'systemuserid,_ab_dim_territory_id_value,_ab_dim_department_id_value',
                '$filter' => "internalemailaddress eq '{$email}' and azurestate eq 0",
                '$top'    => '1',
            ], ttl: 3600);

            $users = $result['value'] ?? [];
            if (empty($users)) return [null, null];

            $territoryRaw  = $users[0]['_ab_dim_territory_id_value@OData.Community.Display.V1.FormattedValue'] ?? null;
            $departmentRaw = $users[0]['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? null;

            $territory = null;
            if ($territoryRaw) {
                $upper     = strtoupper($territoryRaw);
                $territory = in_array($upper, ['SOUTH', 'CENTER', 'NORTH']) ? $upper : null;
            }

            return [$territory, $departmentRaw ?: null];
        } catch (\Throwable) {
            return [null, null];
        }
    }
}
