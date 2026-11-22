/**
 * POJOX CLASH STORE - SUPABASE CLIENT & CLOUD SYNC MODULE
 * Connects the Clash of Clans marketplace to Supabase PostgreSQL database
 */

// Konfigurasi Supabase
// Anda dapat memasukkan URL dan Anon Key di sini atau menyimpannya lewat Panel Admin di browser.
const SUPABASE_CONFIG = {
  url: "https://toeteaojgpgewnqpoldk.supabase.co", // Contoh: "https://xyzcompany.supabase.co"
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZXRlYW9qZ3BnZXducXBvbGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxOTE4MjUsImV4cCI6MjExMDc2NzgyNX0.5JVza6MX34BXWasg-TF_09uVTEwQWaIV--sBoZTBceo", // Anon public key Supabase
};

let supabaseClient = null;

// Inisialisasi Supabase Client jika kredensial tersedia
function initSupabase() {
  const url = localStorage.getItem("pojox_supabase_url") || SUPABASE_CONFIG.url;
  const key = localStorage.getItem("pojox_supabase_anon_key") || SUPABASE_CONFIG.anonKey;

  if (url && key && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(url, key);
      console.log("✅ Supabase Client berhasil diinisialisasi");
      return true;
    } catch (e) {
      console.error("Gagal menginisialisasi Supabase Client:", e);
      supabaseClient = null;
    }
  }
  return false;
}

function isSupabaseActive() {
  return supabaseClient !== null;
}

function saveSupabaseCredentials(url, anonKey) {
  localStorage.setItem("pojox_supabase_url", url.trim());
  localStorage.setItem("pojox_supabase_anon_key", anonKey.trim());
  return initSupabase();
}

// -------------------------------------------------------------
// OPERASI DATABASE (CRUD) DENGAN FALLBACK OTOMATIS
// -------------------------------------------------------------

// 1. Ambil Semua Akun dari Supabase / Fallback LocalStorage
async function apiGetAccounts() {
  if (isSupabaseActive()) {
    try {
      const { data, error } = await supabaseClient
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        // Map database columns to app schema
        return data.map(item => ({
          id: item.id,
          code: item.code,
          title: item.title,
          th: item.th,
          status: item.status,
          price: item.price,
          originalPrice: item.original_price,
          image: item.image,
          heroes: { bk: item.bk, aq: item.aq, gw: item.gw, rc: item.rc, mp: item.mp || 0, dd: item.dd || 0 },
          gems: item.gems,
          cwlMedals: item.cwl_medals,
          changeName: item.change_name,
          scidStatus: item.scid_status,
          trophies: item.trophies,
          equipment: item.equipment,
          pets: item.pets,
          description: item.description
        }));
      }
    } catch (err) {
      console.warn("Gagal fetch Supabase, beralih ke LocalStorage fallback:", err);
    }
  }

  // Fallback jika Supabase belum terhubung
  const local = localStorage.getItem("pojox_accounts_data");
  if (local) {
    try {
      return JSON.parse(local);
    } catch(e) {}
  }
  return typeof DEFAULT_ACCOUNTS_DATA !== "undefined" ? [...DEFAULT_ACCOUNTS_DATA] : [];
}

// 2. Tambah Akun Baru
async function apiAddAccount(account) {
  if (isSupabaseActive()) {
    try {
      const payload = {
        code: account.code,
        title: account.title,
        th: account.th,
        status: account.status,
        price: account.price,
        original_price: account.originalPrice,
        image: account.image,
        bk: account.heroes.bk,
        aq: account.heroes.aq,
        gw: account.heroes.gw,
        rc: account.heroes.rc,
        mp: account.heroes.mp || 0,
        dd: account.heroes.dd || 0,
        gems: account.gems,
        cwl_medals: account.cwlMedals,
        change_name: account.changeName,
        scid_status: account.scidStatus,
        trophies: account.trophies,
        equipment: account.equipment,
        pets: account.pets,
        description: account.description
      };

      const { data, error } = await supabaseClient.from("accounts").insert([payload]).select();
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error("Error inserting to Supabase:", err);
      // fallback to local
    }
  }

  // Local fallback
  return { success: true, localOnly: true };
}

// 3. Update Status Akun (Ready / Sold)
async function apiUpdateStatus(code, newStatus) {
  if (isSupabaseActive()) {
    try {
      const { error } = await supabaseClient
        .from("accounts")
        .update({ status: newStatus })
        .eq("code", code);

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error("Error updating status in Supabase:", err);
    }
  }
  return { success: true, localOnly: true };
}

// 4. Hapus Akun
async function apiDeleteAccount(code) {
  if (isSupabaseActive()) {
    try {
      const { error } = await supabaseClient
        .from("accounts")
        .delete()
        .eq("code", code);

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error("Error deleting from Supabase:", err);
    }
  }
  return { success: true, localOnly: true };
}

// 5. Upload gambar ke Supabase Storage (bucket publik "stok-images")
async function apiUploadImage(blob, fileName) {
  if (!isSupabaseActive()) {
    throw new Error("Supabase belum terhubung.");
  }
  const safeName = String(fileName).toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
  const path = `${Date.now()}-${safeName}`;

  const { error } = await supabaseClient.storage
    .from("stok-images")
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) throw error;

  const { data } = supabaseClient.storage.from("stok-images").getPublicUrl(path);
  return data.publicUrl;
}

// -------------------------------------------------------------
// AUTENTIKASI ADMIN SUPABASE
// -------------------------------------------------------------

async function apiAdminLogin(email, password) {
  if (isSupabaseActive()) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }
  throw new Error("Supabase belum dikonfigurasi. Silakan masukkan URL & Anon Key di pengaturan admin.");
}

async function apiAdminLogout() {
  if (isSupabaseActive()) {
    await supabaseClient.auth.signOut();
  }
}

async function apiGetAdminSession() {
  if (isSupabaseActive()) {
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  }
  return null;
}