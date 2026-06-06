<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin@huutoan.com'],
            [
                'name'       => 'Admin',
                'password'   => 'admin123',
                'is_admin'   => true,
                'territory'  => null,
                'department' => null,
            ]
        );
    }
}
