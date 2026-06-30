"""Plantillas HTML de correo con la identidad visual de Upiixia.

Email-safe: layout con tablas y estilos inline (los clientes de correo no soportan
hojas de estilo ni variables CSS). Los colores replican los tokens de marca del
frontend (`frontend/app/globals.css`).
"""
from __future__ import annotations

from html import escape

# Paleta de marca (espejo de los tokens de globals.css)
BG = "#F5F0EA"
SURFACE = "#FFFFFF"
TEXT = "#302F2D"
TEXT_SECONDARY = "#5C5957"
MUTED = "#989396"
BORDER = "#E5DED6"
ACCENT = "#F19B42"
ACCENT_DARK = "#A86518"
SUCCESS = "#536648"
ERROR_TEXT = "#991B1B"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def _shell(nombre: str, contenido: str) -> str:
    """Envuelve `contenido` (HTML ya armado) en la tarjeta de marca."""
    saludo = escape(nombre)
    return f"""\
<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:{BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:{SURFACE};border:1px solid {BORDER};border-radius:14px;">
          <tr>
            <td style="padding:32px 36px;font-family:{FONT};color:{TEXT};font-size:15px;line-height:1.6;">
              <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:{ACCENT_DARK};">Hola {saludo},</p>
              {contenido}
              <p style="margin:24px 0 0;color:{TEXT};">Gracias.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _lista(items_html: list[str]) -> str:
    filas = "".join(
        f'<li style="margin:0 0 6px;">{it}</li>' for it in items_html
    )
    return f'<ul style="margin:8px 0 0;padding-left:20px;">{filas}</ul>'


def _boton(texto: str, href: str) -> str:
    return f"""\
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
  <tr>
    <td align="center" bgcolor="{ACCENT}" style="border-radius:10px;">
      <a href="{escape(href, quote=True)}" target="_blank"
         style="display:inline-block;padding:12px 26px;font-family:{FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
        {escape(texto)}
      </a>
    </td>
  </tr>
</table>"""


def confirmacion_html(
    nombre: str,
    case_code: str,
    documentos: list[str],
) -> str:
    """Acuse de recibo de documentos asignados a un expediente, en HTML de marca.

    `documentos`: nombres de los archivos recibidos. Si va vacio, se muestra un
    mensaje generico (un solo documento sin desglosar).
    """
    code = escape(case_code)
    n = len(documentos)

    if documentos:
        items = [f'<span style="color:{TEXT};">{escape(d)}</span>' for d in documentos]
        cuerpo = (
            f'<p style="margin:0 0 4px;">Recibimos <strong>{n}</strong> '
            f'documento{"s" if n != 1 else ""} para tu expediente '
            f'<strong>{code}</strong>:</p>' + _lista(items)
        )
    else:
        cuerpo = (
            f'<p style="margin:0 0 4px;">Recibimos tu documento para el expediente '
            f'<strong>{code}</strong>.</p>'
        )

    cuerpo += (
        f'<p style="margin:18px 0 0;color:{TEXT_SECONDARY};">Los estamos analizando. '
        f'Te avisaremos si necesitamos algo mas.</p>'
    )
    return _shell(nombre, cuerpo)


def digest_html(
    nombre: str,
    case_code: str,
    aprobados: list[str],
    rechazados: list[tuple[str, str]],
    system_email: str,
) -> str:
    """Correo resumen (digest) de validacion/rechazo, en HTML de marca.

    `aprobados`: etiquetas de documentos aprobados.
    `rechazados`: pares (etiqueta, motivo) de documentos rechazados.
    """
    code = escape(case_code)
    partes = [
        f'<p style="margin:0 0 4px;">Revisamos los documentos de tu expediente '
        f'<strong>{code}</strong>:</p>'
    ]

    if aprobados:
        items = [
            f'<span style="color:{SUCCESS};font-weight:700;">&#10003;</span> '
            f'<span style="color:{TEXT};">{escape(lbl)}</span>'
            for lbl in aprobados
        ]
        partes.append(
            f'<p style="margin:18px 0 0;font-weight:700;color:{TEXT};">Documentos aprobados</p>'
            + _lista(items)
        )

    if rechazados:
        items = []
        for lbl, motivo in rechazados:
            items.append(
                f'<span style="color:{ERROR_TEXT};font-weight:700;">&#10007;</span> '
                f'<span style="color:{TEXT};font-weight:600;">{escape(lbl)}</span> '
                f'<span style="color:{MUTED};">({escape(motivo)})</span>'
            )
        partes.append(
            f'<p style="margin:18px 0 0;font-weight:700;color:{TEXT};">'
            f'Documentos rechazados <span style="color:{MUTED};font-weight:400;">'
            f'(envia una nueva version)</span></p>' + _lista(items)
        )
        partes.append(
            f'<p style="margin:18px 0 0;color:{TEXT_SECONDARY};">Puedes responder a este '
            f'mismo correo con los documentos adjuntos, o enviarlos a '
            f'<a href="mailto:{escape(system_email, quote=True)}?subject={code}" '
            f'style="color:{ACCENT_DARK};">{escape(system_email)}</a> con el codigo '
            f'<strong>{code}</strong> en el asunto.</p>'
        )
        partes.append(_boton("Enviar mis documentos", f"mailto:{system_email}?subject={case_code}"))
        partes.append(
            f'<p style="margin:18px 0 6px;font-weight:700;color:{TEXT};">Recomendaciones:</p>'
            + _lista(
                [
                    f'<span style="color:{TEXT_SECONDARY};">Adjunta cada documento en PDF o foto (max. 15 MB por archivo).</span>',
                    f'<span style="color:{TEXT_SECONDARY};">Puedes mandarlos todos en un solo correo o uno por uno.</span>',
                ]
            )
        )
    elif aprobados:
        partes.append(
            f'<p style="margin:18px 0 0;color:{TEXT_SECONDARY};">No necesitas hacer nada '
            f'mas por ahora; te avisaremos del siguiente paso.</p>'
        )

    return _shell(nombre, "\n".join(partes))
