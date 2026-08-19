//! Envío de correo transaccional (por ahora, solo bienvenida). En dev usa
//! mailhog (el mismo SMTP que ya consume GoTrue, ver
//! `platform/docker-compose.yml`); en producción basta con apuntar
//! `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` a un proveedor real.

use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

#[derive(Clone)]
pub struct Mailer {
    remitente: Mailbox,
    transporte: AsyncSmtpTransport<Tokio1Executor>,
}

impl Mailer {
    pub fn from_env() -> Result<Self, String> {
        let host = std::env::var("SMTP_HOST").unwrap_or_else(|_| "mailhog".to_string());
        let port: u16 = std::env::var("SMTP_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(1025);
        let remitente_correo =
            std::env::var("SMTP_SENDER_EMAIL").unwrap_or_else(|_| "dev@obrix.local".to_string());
        let remitente_nombre =
            std::env::var("SMTP_SENDER_NAME").unwrap_or_else(|_| "Obrix".to_string());
        let remitente = format!("{remitente_nombre} <{remitente_correo}>")
            .parse::<Mailbox>()
            .map_err(|e| e.to_string())?;

        // Con credenciales, se asume un relay real (STARTTLS); sin ellas, se
        // asume un SMTP de desarrollo sin auth/TLS como mailhog.
        let transporte = match (std::env::var("SMTP_USER"), std::env::var("SMTP_PASSWORD")) {
            (Ok(usuario), Ok(password)) => AsyncSmtpTransport::<Tokio1Executor>::relay(&host)
                .map_err(|e| e.to_string())?
                .port(port)
                .credentials(Credentials::new(usuario, password))
                .build(),
            _ => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&host)
                .port(port)
                .build(),
        };

        Ok(Self {
            remitente,
            transporte,
        })
    }

    pub async fn enviar_bienvenida(&self, correo: &str, nombre: &str) -> Result<(), String> {
        let destinatario = format!("{nombre} <{correo}>")
            .parse::<Mailbox>()
            .map_err(|e| e.to_string())?;
        let mensaje = Message::builder()
            .from(self.remitente.clone())
            .to(destinatario)
            .subject("Bienvenido a Obrix")
            .body(format!(
                "Hola {nombre},\n\nTu cuenta en Obrix ha sido creada correctamente.\n\nEquipo Obrix"
            ))
            .map_err(|e| e.to_string())?;
        self.transporte
            .send(mensaje)
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
