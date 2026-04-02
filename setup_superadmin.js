const db = require("./config/db");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

async function setupSuperAdmin() {
  console.log("🚀 Setup Super Admin System...\n");

  try {
    // 1. Jalankan migration
    console.log("📋 Step 1: Menjalankan migration...");
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, "migrations", "create_super_admins.sql"),
      "utf8"
    );

    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      await new Promise((resolve, reject) => {
        db.query(statement, (err) => {
          if (err) {
            console.error("Error executing statement:", err.message);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    console.log("✅ Migration berhasil!\n");

    // 2. Buat akun super admin
    console.log("📋 Step 2: Membuat akun Super Admin...");
    const email = "astakira@gmail.com";
    const password = "astakira1901";
    const username = "superadmin";
    const full_name = "Super Administrator";

    const hashedPassword = await bcrypt.hash(password, 10);

    const checkResult = await new Promise((resolve, reject) => {
      db.query("SELECT * FROM super_admins WHERE email = ?", [email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (checkResult && checkResult.length > 0) {
      console.log("⚠️  Super Admin sudah ada di database");
      console.log("📧 Email:", email);
    } else {
      const insertResult = await new Promise((resolve, reject) => {
        db.query(
          "INSERT INTO super_admins (username, email, password, full_name) VALUES (?, ?, ?, ?)",
          [username, email, hashedPassword, full_name],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      console.log("✅ Super Admin berhasil dibuat!");
      console.log("🆔 ID:", insertResult.insertId);
      console.log("📧 Email:", email);
      console.log("🔑 Password:", password);
      console.log("👤 Username:", username);
    }

    console.log("\n🎉 Setup Super Admin selesai!");
    console.log("\n📝 Informasi Login:");
    console.log("   URL: http://localhost:5173/superadmin/login");
    console.log("   Email:", email);
    console.log("   Password:", password);
    console.log("\n📡 API Endpoints:");
    console.log("   POST   /api/superadmin/login");
    console.log("   GET    /api/superadmin/stats");
    console.log("   GET    /api/superadmin/cafes");
    console.log("   GET    /api/superadmin/admins");
    console.log("   GET    /api/superadmin/reports");
    console.log("   GET    /api/superadmin/analytics");
    console.log("   GET    /api/superadmin/settings");

    db.end();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    db.end();
    process.exit(1);
  }
}

setupSuperAdmin();
