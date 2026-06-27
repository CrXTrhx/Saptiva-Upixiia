// Config del sistema para las instrucciones al cliente.
// El correo (correoSistema) es la direccion Mailgun a la que el cliente envia sus
// documentos; debe coincidir con SYSTEM_EMAIL del backend y con la Route de Mailgun.
// Se puede sobreescribir con variables NEXT_PUBLIC_* (ver .env.example).
export const configSistema = {
  whatsappSistema:
    process.env.NEXT_PUBLIC_SYSTEM_WHATSAPP ?? "+52 55 1234 5678",
  correoSistema:
    process.env.NEXT_PUBLIC_SYSTEM_EMAIL ?? "documentos@mg.digitalfoldr.com",
};
