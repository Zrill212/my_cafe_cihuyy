const db = require("./config/db");
const bcrypt = require("bcryptjs");

async function seedSuperAdmin() {
  console.log("🌱 Seeding Super Admin...");

  const email = "astakira@gmail.com";
  const password = "astakira1901";
  const username = "superadmin";
  const full_name = "Super Administrator";

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "SELECT * FROM super_admins WHERE email = ?",
      [email],
      (err, results) => {
        if (err) {
          console.error("❌ Error checking super admin:", err);
          process.exit(1);
        }

        if (results && results.length > 0) {
          db.query(
            "UPDATE super_admins SET username = ?, password = ?, full_name = ? WHERE email = ?",
            [username, hashedPassword, full_name, email],
            (updateErr) => {
              if (updateErr) {
                console.error("❌ Error updating super admin:", updateErr);
                process.exit(1);
              }
              console.log("✅ Super Admin sudah ada, password di-reset!");
              console.log("📧 Email:", email);
              console.log("🔑 Password:", password);
              console.log("👤 Username:", username);
              db.end();
              process.exit(0);
            },
          );
        } else {
          db.query(
            "INSERT INTO super_admins (username, email, password, full_name) VALUES (?, ?, ?, ?)",
            [username, email, hashedPassword, full_name],
            (err, result) => {
              if (err) {
                console.error("❌ Error creating super admin:", err);
                process.exit(1);
              }

              console.log("✅ Super Admin berhasil dibuat!");
              console.log("📧 Email:", email);
              console.log("🔑 Password:", password);
              console.log("👤 Username:", username);
              console.log("🆔 ID:", result.insertId);
              
              db.end();
              process.exit(0);
            }
          );
        }
      }
    );
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

seedSuperAdmin();
