function toPublicError(err, fallbackMessage) {
  const fallback = fallbackMessage || "Terjadi kesalahan, coba lagi";

  const code = err && err.code;
  const rawMessage = String(err?.sqlMessage || err?.message || "").toLowerCase();

  if (code === "ER_DUP_ENTRY") {
    if (rawMessage.includes("nama_cafe")) {
      return { status: 400, message: "Nama Cafe Sudah Diisi" };
    }
    if (rawMessage.includes("email")) {
      return { status: 400, message: "Email sudah digunakan" };
    }
    return { status: 400, message: "Data sudah digunakan" };
  }

  return { status: 500, message: fallback };
}

module.exports = { toPublicError };
