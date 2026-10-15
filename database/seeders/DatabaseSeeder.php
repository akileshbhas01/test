<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Address;
use App\Models\Product;
use App\Models\Coupon;
use App\Models\Blog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        if (env('DEMO_SEED_ACCOUNTS', true)) {
            // 1. Admin User
            User::firstOrCreate(
                ['email' => 'admin@lemurra.in'],
                [
                    'name' => 'Lemurra Admin',
                    'password' => Hash::make('lemurra@2026'),
                    'phone' => '916383408380',
                    'role' => 'admin',
                ]
            );

            // 2. Demo Customer
            $demoUser = User::firstOrCreate(
                ['email' => 'demo@lemurra.in'],
                [
                    'name' => 'Demo Customer',
                    'password' => Hash::make('Demo@1234'),
                    'phone' => '9876543210',
                    'role' => 'customer',
                ]
            );

            Address::firstOrCreate(
                [
                    'user_id' => $demoUser->id,
                    'line1' => '14 East Coast Road, Thiruvanmiyur'
                ],
                [
                    'name' => 'Demo Customer',
                    'phone' => '9876543210',
                    'line2' => 'Near Beach Walkway',
                    'city' => 'Chennai',
                    'state' => 'Tamil Nadu',
                    'pin' => '600041',
                    'label' => 'Home',
                    'is_default' => true,
                ]
            );
        }

        // Coupons
        $coupons = [
            [
                'code' => 'WELCOME10',
                'type' => 'pct',
                'value' => 10,
                'min' => 499,
                'max' => 150,
                'active' => true,
                'note' => '10% off, up to ₹150, on orders above ₹499',
            ],
            [
                'code' => 'GIFT100',
                'type' => 'flat',
                'value' => 100,
                'min' => 999,
                'max' => 0,
                'active' => true,
                'note' => '₹100 off on orders above ₹999',
            ],
        ];

        foreach ($coupons as $coupon) {
            Coupon::updateOrCreate(['code' => $coupon['code']], $coupon);
        }

        // 4. Products & Blogs from seeds_data.json
        $seedsDataPath = database_path('seeds_data.json');
        if (file_exists($seedsDataPath)) {
            $data = json_decode(file_get_contents($seedsDataPath), true);

            if (!empty($data['products'])) {
                foreach ($data['products'] as $p) {
                    Product::updateOrCreate(
                        ['id' => $p['id']],
                        [
                            'name' => $p['name'],
                            'slug' => Str::slug($p['name']) . '-' . strtolower($p['id']),
                            'cat' => $p['cat'] ?? 'Home Decor',
                            'price' => $p['price'] ?? 0,
                            'mrp' => $p['mrp'] ?? 0,
                            'img' => $p['img'] ?? 'logo',
                            'images' => $p['images'] ?? null,
                            'stock' => $p['stock'] ?? 10,
                            'rating' => $p['rating'] ?? 4.7,
                            'reviews' => $p['reviews'] ?? 20,
                            'blurb' => $p['blurb'] ?? '',
                            'specs' => $p['specs'] ?? null,
                            'active' => true,
                        ]
                    );
                }
            }

            if (!empty($data['blogs'])) {
                foreach ($data['blogs'] as $b) {
                    Blog::updateOrCreate(
                        ['slug' => $b['slug']],
                        [
                            'title' => $b['title'],
                            'date' => $b['date'] ?? date('Y-m-d'),
                            'read_time' => $b['read_time'] ?? '3 min read',
                            'tags' => $b['tags'] ?? [],
                            'snippet' => $b['snippet'] ?? '',
                            'content' => is_array($b['content'] ?? null) ? json_encode($b['content']) : ($b['content'] ?? ''),
                            'cover' => $b['cover'] ?? '',
                        ]
                    );
                }
            }
        }
    }
}
