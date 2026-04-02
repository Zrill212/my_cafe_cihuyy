# Panduan Lengkap Sistem Langganan (Subscription System)

## 📋 Ringkasan Sistem

Sistem langganan memungkinkan **Admin Cafe** berlangganan paket berbayar yang dikelola **Super Admin**, dengan pembayaran melalui **Midtrans Snap**, validasi otomatis via **webhook**, dan aktivasi langganan secara real-time.

---

## 🔧 Backend: Sudah Diimplementasi

### 1. Database Schema (Migration)
File: `migrations/create_subscriptions.sql`

**Tabel yang dibuat:**
- `subscription_plans` - Paket langganan (nama, harga, durasi, fitur)
- `cafe_subscriptions` - Status langganan per cafe (active/inactive/expired)
- `subscription_transactions` - Riwayat transaksi pembayaran + webhook data

**Cara menjalankan:**
```sql
-- Jalankan di database cafe-1 via phpMyAdmin atau mysql CLI
SOURCE migrations/create_subscriptions.sql;
```

---

### 2. Environment Variables (`.env` Backend)
```env
# Midtrans
MIDTRANS_SERVER_KEY=Mid-server-xxxxx
MIDTRANS_CLIENT_KEY=Mid-client-xxxxx
MIDTRANS_IS_PRODUCTION=false

# Frontend URL (untuk redirect setelah bayar)
FRONTEND_BASE_URL=https://your-frontend-ngrok.ngrok-free.dev
FRONTEND_RETURN_PATH=/admin/billing/return

# JWT & DB
JWT_SECRET=your-secret-key
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=cafe-1
```

**Penting:**
- `FRONTEND_BASE_URL` = URL frontend (ngrok atau domain publik)
- Restart backend setelah ubah `.env`

---

### 3. API Endpoints

#### **Super Admin (CRUD Paket Langganan)**
Auth: `Authorization: Bearer <SUPERADMIN_TOKEN>`

- **GET** `/api/subscriptions/superadmin/plans`
  - List semua paket
- **POST** `/api/subscriptions/superadmin/plans`
  - Body: `{ name, price, duration_days, features_json, is_active, sort_order }`
- **PUT** `/api/subscriptions/superadmin/plans/:id`
  - Update paket
- **DELETE** `/api/subscriptions/superadmin/plans/:id`
  - Hapus paket

- **GET** `/api/subscriptions/superadmin/transactions`
  - List transaksi langganan (filter: `?cafe_id=&status=&date_from=&date_to=`)
- **GET** `/api/subscriptions/superadmin/transactions/:order_id`
  - Detail transaksi (cek webhook)

#### **Admin Cafe (Langganan & Checkout)**
Auth: `Authorization: Bearer <ADMIN_TOKEN>`

- **GET** `/api/subscriptions/plans`
  - List paket aktif
- **GET** `/api/subscriptions/me`
  - Status langganan cafe saat ini
- **POST** `/api/subscriptions/checkout`
  - Body: `{ plan_id, price }`
  - Response: `{ snap_token, redirect_url, finish_url, order_id }`
- **GET** `/api/subscriptions/transactions/:order_id`
  - Cek status transaksi (untuk debug webhook)

#### **Webhook Midtrans (No Auth, Signature Validated)**
- **POST** `/api/subscriptions/midtrans/notification`
  - Dipanggil Midtrans otomatis setelah pembayaran
  - Validasi signature → update status → aktifkan langganan

---

### 4. Webhook Handler (Validasi Otomatis)

**Lokasi:** `controller/subscriptionController.js` → `midtransNotification`

**Proses:**
1. Terima notifikasi dari Midtrans
2. **Validasi signature** (SHA512: `order_id + status_code + gross_amount + server_key`)
3. Update `subscription_transactions`:
   - `settlement/capture` → `paid`
   - `pending` → `pending`
   - `expire/cancel/deny` → `expired/canceled/failed`
4. Jika status `paid`:
   - Ambil `duration_days` dari plan
   - Hitung `active_until` (extend dari existing jika masih aktif)
   - Insert/update `cafe_subscriptions` → `status='active'`

**Keamanan:**
- Signature wajib valid (cegah request palsu)
- Harga divalidasi saat checkout (backend cek DB)

---

## 🎨 Frontend: Flow UI yang Harus Diimplementasi

### **Alur Lengkap (User Journey)**

```
1. Admin Cafe → Halaman Billing/Langganan
   ↓
2. Pilih Paket → Klik "Bayar"
   ↓
3. Frontend: POST /api/subscriptions/checkout
   ← Backend: { snap_token, redirect_url, finish_url, order_id }
   ↓
4. Redirect ke Midtrans: window.location.href = redirect_url
   ↓
5. User bayar di Midtrans
   ↓
6. Midtrans redirect ke: finish_url (frontend return page)
   URL: /admin/billing/return?order_id=SUB-xxx&result=finish
   ↓
7. Frontend Return Page: Polling GET /api/subscriptions/me
   (tiap 2-3 detik, max 60 detik)
   ↓
8. Jika status === "active" && active_until > now
   → Redirect ke /admin/dashboard
   ↓
9. Dashboard: Tampilkan fitur sesuai features_json
```

---

### **A) Halaman Billing/Langganan (`/admin/billing`)**

**Fetch data:**
```js
// 1. Ambil paket aktif
GET /api/subscriptions/plans
// Response: [{ id, name, price, duration_days, features_json, ... }]

// 2. Ambil status langganan cafe
GET /api/subscriptions/me
// Response: { status, active_until, plan_name, features_json, ... }
```

**UI:**
- Card paket langganan (nama, harga, durasi, fitur)
- Badge status: "Aktif sampai DD/MM/YYYY" atau "Tidak Aktif"
- Tombol "Bayar" (disabled jika sudah aktif + belum expired)

**Saat klik "Bayar":**
```js
async function handleCheckout(planId, price) {
  const res = await fetch('/api/subscriptions/checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ plan_id: planId, price })
  });
  
  const data = await res.json();
  
  if (res.ok) {
    // Simpan order_id untuk tracking (opsional)
    localStorage.setItem('last_sub_order_id', data.data.order_id);
    
    // Redirect ke Midtrans
    window.location.href = data.data.redirect_url;
  } else {
    alert(data.message); // Harga tidak sesuai / error
  }
}
```

---

### **B) Halaman Return (`/admin/billing/return`)**

**Query params:**
- `order_id` - ID transaksi
- `result` - `finish|unfinish|error`

**UI State:**
- Loading: "Memverifikasi pembayaran..."
- Success: "Langganan aktif! Mengarahkan ke dashboard..."
- Timeout: "Pembayaran sedang diproses. Klik 'Cek Lagi' atau refresh halaman."

**Polling Logic:**
```js
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function BillingReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading|success|timeout
  const orderId = searchParams.get('order_id');
  const result = searchParams.get('result');

  useEffect(() => {
    let interval;
    let timeout;
    let attempts = 0;
    const maxAttempts = 20; // 20 x 3s = 60s

    async function checkSubscription() {
      try {
        const res = await fetch('/api/subscriptions/me', {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();

        if (res.ok && data.data.status === 'active') {
          const activeUntil = new Date(data.data.active_until);
          if (activeUntil > new Date()) {
            setStatus('success');
            clearInterval(interval);
            clearTimeout(timeout);
            
            // Redirect ke dashboard setelah 1 detik
            setTimeout(() => navigate('/admin/dashboard'), 1000);
            return;
          }
        }

        attempts++;
        if (attempts >= maxAttempts) {
          setStatus('timeout');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }

    // Mulai polling
    checkSubscription();
    interval = setInterval(checkSubscription, 3000);
    timeout = setTimeout(() => {
      clearInterval(interval);
      setStatus('timeout');
    }, 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div>
      {status === 'loading' && (
        <div>
          <Spinner />
          <p>Memverifikasi pembayaran...</p>
          <p className="text-sm">Order ID: {orderId}</p>
        </div>
      )}
      
      {status === 'success' && (
        <div>
          <CheckIcon />
          <p>Langganan berhasil diaktifkan!</p>
          <p>Mengarahkan ke dashboard...</p>
        </div>
      )}
      
      {status === 'timeout' && (
        <div>
          <WarningIcon />
          <p>Pembayaran sedang diproses.</p>
          <p>Silakan refresh halaman atau cek status di Billing.</p>
          <button onClick={() => window.location.reload()}>
            Cek Lagi
          </button>
          <button onClick={() => navigate('/admin/billing')}>
            Kembali ke Billing
          </button>
        </div>
      )}
    </div>
  );
}
```

---

### **C) Dashboard (`/admin/dashboard`)**

**Feature Gating (Proteksi Fitur):**
```js
// Fetch subscription status
const { data } = await fetch('/api/subscriptions/me');
const features = data.features_json || {};

// Conditional rendering
{features.reports && (
  <Link to="/admin/laporan">Laporan</Link>
)}

{!features.reports && (
  <div className="opacity-50 cursor-not-allowed">
    <Lock /> Laporan (Upgrade untuk akses)
  </div>
)}
```

**Backend sudah proteksi:**
- Endpoint `/api/laporan` pakai middleware `requireFeature("reports")`
- Kalau `features.reports !== true` → 403

---

## ⚙️ Konfigurasi Midtrans Dashboard

### **1. Notification URL (Webhook)**
**Settings → Configuration → Payment Notification URL**

Isi:
```
https://your-backend-ngrok.ngrok-free.dev/api/subscriptions/midtrans/notification
```

**Catatan:**
- Harus URL backend (bukan frontend)
- Harus bisa diakses publik (pakai ngrok jika lokal)
- Wajib ada path `/api/subscriptions/midtrans/notification`

### **2. Snap Redirect URLs**
**Settings → Snap Preferences**

Isi semua 3 field:
- **Finish Redirect URL**
  ```
  https://your-frontend-ngrok.ngrok-free.dev/admin/billing/return
  ```
- **Unfinish Redirect URL**
  ```
  https://your-frontend-ngrok.ngrok-free.dev/admin/billing/return
  ```
- **Error Redirect URL**
  ```
  https://your-frontend-ngrok.ngrok-free.dev/admin/billing/return
  ```

**Catatan:**
- Harus URL frontend (tempat user kembali setelah bayar)
- Wajib ada path `/admin/billing/return`
- Kalau tidak diisi → fallback ke `example.com`

---

## 🐛 Debugging & Troubleshooting

### **1. Redirect ke `example.com` setelah bayar**
**Penyebab:**
- Snap Redirect URLs di Midtrans belum diisi / masih default
- `FRONTEND_BASE_URL` di backend belum diset
- Backend belum restart setelah ubah env

**Solusi:**
- Set 3 redirect URLs di Midtrans Snap Preferences
- Set `FRONTEND_BASE_URL` di `.env` backend
- Restart backend
- Test: cek response `POST /api/subscriptions/checkout` → `finish_url` harus bukan `null`

### **2. Webhook tidak masuk (subscription tidak aktif)**
**Penyebab:**
- Notification URL salah / tidak publik
- Backend tidak running / ngrok mati
- Path webhook salah

**Solusi:**
- Pastikan Notification URL = `https://backend-ngrok/api/subscriptions/midtrans/notification`
- Cek log backend: harus ada request `POST /api/subscriptions/midtrans/notification`
- Test: `GET /api/subscriptions/transactions/:order_id` → `webhook_received: true`

### **3. Polling tidak pernah redirect ke dashboard**
**Penyebab:**
- Webhook belum masuk (lihat #2)
- Token admin hilang setelah redirect
- Endpoint `/api/subscriptions/me` error 401

**Solusi:**
- Simpan token di `localStorage` (bukan state)
- Cek Network tab: request `/me` harus ada header `Authorization`
- Pastikan webhook sudah masuk dulu

### **4. Error 403 "Fitur tidak tersedia" di laporan**
**Penyebab:**
- `features_json.reports` di plan = `false` atau tidak ada
- Subscription belum aktif / expired

**Solusi:**
- Update plan di Super Admin: set `features_json = { "reports": true }`
- Cek `GET /api/subscriptions/me` → pastikan `status: "active"` dan `features_json.reports: true`

---

## 📊 Contoh Data

### **Subscription Plan (JSON)**
```json
{
  "id": 1,
  "name": "Basic",
  "price": 50000,
  "duration_days": 30,
  "features_json": {
    "reports": true,
    "multi_kasir": false,
    "promo": true,
    "custom_theme": false
  },
  "is_active": 1,
  "sort_order": 1
}
```

### **Cafe Subscription (Active)**
```json
{
  "cafe_id": 27,
  "plan_id": 1,
  "status": "active",
  "started_at": "2026-04-01 10:00:00",
  "active_until": "2026-05-01 10:00:00",
  "plan_name": "Basic",
  "features_json": { "reports": true, "promo": true }
}
```

### **Transaction (Paid)**
```json
{
  "id": 10,
  "order_id": "SUB-27-MNFO4FZN-D502",
  "cafe_id": 27,
  "plan_id": 1,
  "expected_amount": 50000,
  "status": "paid",
  "transaction_status": "settlement",
  "webhook_received": true,
  "created_at": "2026-04-01 10:00:00"
}
```

---

## ✅ Checklist Implementasi Frontend

- [ ] Halaman `/admin/billing` (list paket + status langganan)
- [ ] Tombol "Bayar" → `POST /api/subscriptions/checkout` → redirect Midtrans
- [ ] Halaman `/admin/billing/return` (polling `/me` + redirect dashboard)
- [ ] Dashboard: feature gating (hide/disable fitur jika `features.xxx !== true`)
- [ ] UI loading/success/error states yang jelas
- [ ] Handle token auth (simpan di localStorage)

---

## 🚀 Testing End-to-End

1. **Setup:**
   - Jalankan migration SQL
   - Set env backend (`FRONTEND_BASE_URL`, `MIDTRANS_*`)
   - Set Midtrans Dashboard (Notification URL + Snap Redirects)
   - Jalankan ngrok untuk backend & frontend (jika lokal)

2. **Super Admin:**
   - Login superadmin
   - Buat paket: `POST /api/subscriptions/superadmin/plans`
   - Set `features_json = { "reports": true }`

3. **Admin Cafe:**
   - Login admin cafe
   - Buka `/admin/billing`
   - Klik "Bayar" paket
   - Bayar di Midtrans Sandbox (gunakan test card)
   - Setelah bayar → harus balik ke `/admin/billing/return`
   - Tunggu polling (max 60s) → auto redirect `/admin/dashboard`

4. **Verifikasi:**
   - `GET /api/subscriptions/me` → `status: "active"`
   - `GET /api/subscriptions/transactions/:order_id` → `webhook_received: true`
   - Akses `/api/laporan` → 200 (tidak 403)

---

## 📞 Support

Jika ada error:
1. Cek log backend (console)
2. Cek Network tab frontend (status code + response)
3. Cek endpoint debug: `GET /api/subscriptions/transactions/:order_id`
4. Pastikan webhook masuk: `webhook_received: true`

---

**Sistem sudah siap digunakan!** 🎉
