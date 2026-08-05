import api from "./api.js";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadFile(file, purpose = "document") {
  const dataBase64 = await readFileAsBase64(file);
  const { data } = await api.post("/uploads", {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    dataBase64,
    purpose
  });
  return data;
}
