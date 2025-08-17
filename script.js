// ==========================
// Supabase Config
// ==========================
const SUPABASE_URL = "https://qslfgjasizcayrrcqjdp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzbGZnamFzaXpjYXlycmNxamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTU5MjUsImV4cCI6MjA3MDE5MTkyNX0.u7bGrxlycZZi8jBPk1Y5qM79PvXfIAaJ5jmjvp6CjxY";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================
// Util & Helpers
// ==========================
const getNickname = () => localStorage.getItem("nickname") || "";
const normalizeNick = (n) => (n || "").toLowerCase().replace(/\s+/g, "");
const fmtBytes = (bytes = 0) => {
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
};
const encodeURIComponentPath = (path) => path.split("/").map(encodeURIComponent).join("/");

// UI helpers (uploads.html)
function showProgressUI(show) {
  const cont = document.getElementById("progress-container");
  if (!cont) return;
  cont.style.display = show ? "block" : "none";
}
function setProgress(pct) {
  const bar = document.getElementById("upload-progress");
  const txt = document.getElementById("progress-text");
  if (bar) bar.value = pct;
  if (txt) txt.textContent = `${pct}%`;
}
function toggleUploadButtons({ uploading }) {
  const pauseBtn = document.getElementById("pause-btn");
  const resumeBtn = document.getElementById("resume-btn");
  const cancelBtn = document.getElementById("cancel-btn");
  const fileInput = document.getElementById("file-input");

  if (fileInput) fileInput.disabled = !!uploading;
  if (pauseBtn) pauseBtn.style.display = uploading ? "inline-block" : "none";
  if (resumeBtn) resumeBtn.style.display = "none"; // default hidden
  if (cancelBtn) cancelBtn.style.display = uploading ? "inline-block" : "none";
}

// ==========================
// Auth (index.html)
// ==========================
function togglePassword(id) {
  const el = document.getElementById(id);
  if (el) el.type = el.type === "password" ? "text" : "password";
}
function showRegister() {
  const a = document.getElementById("login-form");
  const b = document.getElementById("register-form");
  const c = document.getElementById("forgot-form");
  if (a && b && c) { a.style.display = "none"; b.style.display = "block"; c.style.display = "none"; }
}
function showLogin() {
  const a = document.getElementById("login-form");
  const b = document.getElementById("register-form");
  const c = document.getElementById("forgot-form");
  if (a && b && c) { a.style.display = "block"; b.style.display = "none"; c.style.display = "none"; }
}
function showForgotPassword() {
  const a = document.getElementById("login-form");
  const b = document.getElementById("register-form");
  const c = document.getElementById("forgot-form");
  if (a && b && c) { a.style.display = "none"; b.style.display = "none"; c.style.display = "block"; }
}

async function register() {
  const nickname = document.getElementById("register-nickname")?.value?.trim();
  const password = document.getElementById("register-password")?.value;
  if (!nickname || !password) return alert("Isi semua kolom!");
  const { error } = await supabase.from("users").insert([{ nickname, password }]);
  if (error) return alert("Error: " + error.message);
  alert("Pendaftaran berhasil!");
  showLogin();
}

async function login() {
  const nickname = document.getElementById("login-nickname")?.value?.trim();
  const password = document.getElementById("login-password")?.value;
  if (!nickname || !password) return alert("Isi semua kolom!");
  const { data, error } = await supabase
    .from("users").select("*").eq("nickname", nickname).eq("password", password).single();
  if (error || !data) return alert("Login gagal!");
  localStorage.setItem("nickname", nickname);
  window.location.href = "dashboard.html";
}

async function resetPassword() {
  const nickname = document.getElementById("forgot-nickname")?.value?.trim();
  const newPass = prompt("Masukkan password baru:");
  if (!nickname || !newPass) return;
  const { error } = await supabase.from("users").update({ password: newPass }).eq("nickname", nickname);
  if (error) return alert("Error: " + error.message);
  alert("Password berhasil diubah!");
  showLogin();
}

function logout() {
  localStorage.removeItem("nickname");
  window.location.href = "index.html";
}

// ==========================
// Route Guards (redirect jika belum login)
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  const path = location.pathname;
  if (path.includes("dashboard.html") || path.includes("uploads.html")) {
    if (!getNickname()) {
      window.location.href = "index.html";
      return;
    }
  }
  // Inisialisasi sesuai halaman
  if (path.includes("uploads.html")) {
    initUploadsPage();
  } else if (path.includes("dashboard.html")) {
    // Dashboard sengaja simpel, tidak ada list/upload di sini
  }
});

// ==========================
// Uploads Page State
// ==========================
const UP = {
  xhr: null,
  paused: false,
  currentPath: "",
};

// ==========================
// Init Uploads Page
// ==========================
function initUploadsPage() {
  // Set nickname di header (uploads.html juga sudah set via inline script)
  const span = document.getElementById("user-nickname");
  if (span) span.textContent = getNickname();

  // Muat daftar file pertama kali
  loadFiles();
}

// ==========================
// Upload (progress + pause/resume/cancel)
// Catatan: pause/resume di sini menghentikan request berjalan.
// Resume akan mengulangi upload dari awal (Supabase belum mendukung resume parsial).
// ==========================
function startUpload() {
  const file = document.getElementById("file-input")?.files?.[0];
  if (!file) return alert("Pilih file dulu!");

  const nick = getNickname();
  if (!nick) return alert("Session habis. Silakan login ulang.");
  const base = normalizeNick(nick);

  const targetPath = `${base}/${Date.now()}_${file.name}`;
  UP.currentPath = targetPath;

  // Siapkan UI
  showProgressUI(true);
  setProgress(0);
  toggleUploadButtons({ uploading: true });
  UP.paused = false;

  // Gunakan XHR ke REST endpoint Supabase Storage
  const url = `${SUPABASE_URL}/storage/v1/object/uploads/${encodeURIComponentPath(targetPath)}`;
  const xhr = new XMLHttpRequest();
  UP.xhr = xhr;

  xhr.open("POST", url, true);
  xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_KEY}`);
  xhr.setRequestHeader("x-upsert", "false");

  xhr.upload.onprogress = (evt) => {
    if (evt.lengthComputable) {
      const pct = Math.round((evt.loaded / evt.total) * 100);
      setProgress(pct);
    }
  };

  xhr.onload = () => {
    toggleUploadButtons({ uploading: false });
    if (xhr.status >= 200 && xhr.status < 300) {
      setProgress(100);
      alert("Upload selesai!");
      const fi = document.getElementById("file-input");
      if (fi) fi.value = "";
      showProgressUI(false);
      setProgress(0);
      loadFiles();
    } else {
      alert("Upload gagal: " + (xhr.responseText || xhr.statusText));
      showProgressUI(false);
      setProgress(0);
    }
    UP.xhr = null;
  };

  xhr.onerror = () => {
    toggleUploadButtons({ uploading: false });
    alert("Terjadi kesalahan jaringan saat upload.");
    showProgressUI(false);
    setProgress(0);
    UP.xhr = null;
  };

  xhr.onabort = () => {
    toggleUploadButtons({ uploading: false });
    if (UP.paused) {
      // Tampilkan tombol resume
      const resumeBtn = document.getElementById("resume-btn");
      if (resumeBtn) resumeBtn.style.display = "inline-block";
      const pauseBtn = document.getElementById("pause-btn");
      if (pauseBtn) pauseBtn.style.display = "none";
      // progress bar tetap terlihat agar user tahu sudah berapa %
    } else {
      // Cancel total
      showProgressUI(false);
      setProgress(0);
    }
    // Jangan null-kan xhr kalau pause (biar jelas state selesai). Untuk aman, tetap null.
    UP.xhr = null;
  };

  xhr.send(file);
}

function pauseUpload() {
  if (UP.xhr) {
    UP.paused = true;
    UP.xhr.abort(); // stop request
  }
}

function resumeUpload() {
  // Karena belum mendukung resume parsial, kita ulang upload dari awal
  const file = document.getElementById("file-input")?.files?.[0];
  if (!file) return alert("File tidak ditemukan. Pilih lagi.");
  // Reset UI untuk upload ulang
  UP.paused = false;
  const resumeBtn = document.getElementById("resume-btn");
  const pauseBtn = document.getElementById("pause-btn");
  if (resumeBtn) resumeBtn.style.display = "none";
  if (pauseBtn) pauseBtn.style.display = "inline-block";
  toggleUploadButtons({ uploading: true });
  setProgress(0);

  // Mulai ulang (buat path baru agar tidak bentrok jika sebelumnya sempat tersimpan)
  document.getElementById("file-input").dispatchEvent(new Event("change"));
  startUpload();
}

function cancelUpload() {
  if (UP.xhr) {
    UP.paused = false;
    UP.xhr.abort();
    UP.xhr = null;
  }
  showProgressUI(false);
  setProgress(0);
}

// ==========================
// Files: list / delete / rename
// ==========================
async function loadFiles() {
  const list = document.getElementById("file-list");
  if (!list) return; // kalau bukan di uploads.html
  list.innerHTML = "<li>Memuat...</li>";

  const nick = getNickname();
  if (!nick) return;
  const prefix = normalizeNick(nick);

  const { data, error } = await supabase.storage.from("uploads").list(prefix, {
    limit: 100,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    list.innerHTML = "";
    alert("Gagal memuat files: " + error.message);
    return;
  }

  list.innerHTML = "";
  if (!data || data.length === 0) {
    list.innerHTML = "<li>Belum ada file.</li>";
    return;
  }

  data.forEach((f) => {
    const li = document.createElement("li");
    const fullPath = `${prefix}/${f.name}`;

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/uploads/${encodeURIComponentPath(fullPath)}`;
    const sizeText = f?.metadata?.size ? fmtBytes(f.metadata.size) : "";
    const dateText = f?.updated_at ? new Date(f.updated_at).toLocaleString() : "";

    li.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <div>
          <strong>${f.name}</strong>
          ${sizeText ? ` • <span style="color:#666">${sizeText}</span>` : ""}
          ${dateText ? ` • <span style="color:#666">${dateText}</span>` : ""}
        </div>
        <div>
          <a href="${publicUrl}" target="_blank">Open</a>
          <a href="${publicUrl}" download="${f.name}" style="margin-left:8px;">Download</a>
          <button class="rename" style="margin-left:8px;" onclick="renameFile('${encodeURIComponentPath(prefix)}','${f.name.replace(/'/g,"\\'")}')">Rename</button>
          <button class="delete" style="margin-left:6px;background:#dc3545;" onclick="deleteFile('${encodeURIComponentPath(prefix)}','${f.name.replace(/'/g,"\\'")}')">Hapus</button>
        </div>
      </div>
    `;
    list.appendChild(li);
  });
}

async function deleteFile(prefixEnc, name) {
  const prefix = decodeURIComponent(prefixEnc);
  if (!confirm(`Hapus file "${name}"?`)) return;
  const { error } = await supabase.storage.from("uploads").remove([`${prefix}/${name}`]);
  if (error) return alert("Gagal hapus: " + error.message);
  loadFiles();
}

async function renameFile(prefixEnc, oldName) {
  const prefix = decodeURIComponent(prefixEnc);
  const newName = prompt("Nama file baru:", oldName);
  if (!newName || newName === oldName) return;
  const { error } = await supabase.storage.from("uploads").move(
    `${prefix}/${oldName}`,
    `${prefix}/${newName}`
  );
  if (error) return alert("Gagal rename: " + error.message);
  loadFiles();
}
