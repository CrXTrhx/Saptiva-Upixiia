<div align="center">

# Guía de Contribución — digitalfoldr

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/features/issues)

</div>

<br>

Gracias por querer contribuir. Antes de abrir un PR, lee esta guía para mantener la base de código coherente.

---

## Flujo de trabajo

1. **Abre un issue primero** — describe el bug o la feature antes de escribir código. Esto evita trabajo duplicado y alinea expectativas.
2. **Asigna el issue** — espera a que alguien lo apruebe o asígnatelo tú mismo si tienes acceso.
3. **Crea una rama desde `main`:**

```bash
git checkout main && git pull origin main
git checkout -b feature/nombre-descriptivo   # nueva feature
git checkout -b fix/nombre-del-bug           # corrección de bug
```

4. **Desarrolla y prueba** — ver sección [Entorno local](#entorno-local).
5. **Abre el PR contra `main`** con una descripción clara de qué cambió y por qué.

---

## Convenciones de rama

| Prefijo | Cuándo usarlo |
|---------|---------------|
| `feature/` | Nueva funcionalidad |
| `fix/` | Corrección de bug |
| `chore/` | Infraestructura, dependencias, scripts |
| `docs/` | Solo documentación |

---

## Entorno local

Sigue la [guía de Inicio Rápido](README.md#-inicio-rápido) del README para levantar el stack completo.

Antes de abrir un PR, asegúrate de que pasan:

```bash
# Tests unitarios (sin base de datos)
cd backend
pytest tests/test_unit.py

# Smoke end-to-end (requiere la API corriendo en :4000)
python -m tests.smoke
```

---

## Reglas del proyecto

| Regla | Detalle |
|-------|---------|
| **Sin secretos en el repo** | Los `.env` y `*-service-account.json` están en `.gitignore`. Nunca los subas. |
| **Soft-delete obligatorio** | Ninguna tabla se borra físicamente — usar `active_flag = 0`. |
| **Códigos en inglés** | Los valores de catálogo van en inglés mayúsculas: `CAPTURING`, `OFFICIAL_ID`, `WHATSAPP`. |
| **camelCase en la API** | Los esquemas Pydantic usan alias camelCase hacia el frontend. |
| **Rotar credenciales antes de demo** | Si una credencial apareció en un chat o log, rótala antes de cualquier despliegue público. |
| **Auditoría siempre presente** | Todo `INSERT`/`UPDATE` debe pasar por `db_session` para que los triggers `fn_audit` registren el autor. |

---

## Estilo de código

**Backend (Python):**
- Seguir el formato existente — sin linters adicionales por ahora.
- Nombres de variables y funciones en `snake_case`.
- Los módulos nuevos van en `app/modules/<nombre>/` con su propio `router.py`, `service.py` y `schemas.py`.

**Frontend (TypeScript):**
- Componentes en `PascalCase`, hooks en `camelCase`.
- Tipos compartidos van en `lib/types.ts`.
- Llamadas al backend solo a través de los servicios en `services/`.

---

## Mensajes de commit

Formato simple: `verbo en infinitivo + qué + contexto opcional`

```
# Bueno
agregar endpoint de reenvío de instrucciones
corregir validación de CURP en pipeline
actualizar README con pasos de deploy en Render

# Evitar
fix
update stuff
WIP
```

---

## ¿Preguntas?

Abre un issue con la etiqueta `question` y lo revisamos.
