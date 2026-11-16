# Guía de Configuración y Replicación — Visualizador del Catálogo de Objetos Geográficos (IDESoB)

Este documento detalla toda la arquitectura, los módulos implementados, las personalizaciones de datos/interfaz y la configuración de despliegue (Docker + Next.js Standalone) realizados en el proyecto para poder replicar exactamente esta configuración en otro entorno o repositorio.

---

## Tabla de Contenidos

1. [Requisitos del Entorno](#1-requisitos-del-entorno)
2. [Estructura de Archivos Clave](#2-estructura-de-archivos-clave)
3. [Modelo de Datos y Tipado (`lib/types.ts`)](#3-modelo-de-datos-y-tipado-libtypests)
4. [Motor de Búsqueda Global y Utilidades](#4-motor-de-búsqueda-global-y-utilidades)
   - [Hook `useDebounce` (`hooks/use-debounce.ts`)](#41-hook-usedebounce-hooksuse-debouncets)
   - [Normalización y Resaltado (`lib/search-utils.tsx`)](#42-normalización-y-resaltado-libsearch-utilstsx)
   - [Indexación en Memoria (`useMemo`)](#43-indexación-en-memoria-usememo)
   - [Vista de Resultados (`components/search-results.tsx`)](#44-vista-de-resultados-componentssearch-resultstsx)
5. [Personalizaciones del Dashboard (`components/geographic-data-dashboard.tsx`)](#5-personalizaciones-del-dashboard-componentsgeographic-data-dashboardtsx)
6. [Recursos Estáticos y Descargas (`public/`)](#6-recursos-estáticos-y-descargas-public)
7. [Configuración de Producción y Docker](#7-configuración-de-producción-y-docker)
   - [`next.config.mjs`](#71-nextconfigmjs)
   - [`dockerfile`](#72-dockerfile)
   - [`.dockerignore`](#73-dockerignore)
8. [Pasos para Replicar en Otro Entorno](#8-pasos-para-replicar-en-otro-entorno)

---

## 1. Requisitos del Entorno

- **Node.js**: `>= 18.17.0` (recomendado **Node 20 LTS** para coincidir con el contenedor Docker).
- **Gestor de paquetes**: `pnpm` (importante mantener `pnpm-lock.yaml` actualizado para builds reproducibles con `--frozen-lockfile`).
- **Framework y Librerías Base**:
  - Next.js `14.2.16` (App Router)
  - React `18` / TypeScript `5`
  - Tailwind CSS `4.1.9` + Radix UI (`@radix-ui/*`) + `lucide-react`

---

## 2. Estructura de Archivos Clave

```text
├── app/
│   ├── globals.css
│   ├── layout.tsx                        # Metadatos IDESoB y fuentes Geist
│   └── page.tsx                          # Punto de entrada que monta GeographicDataDashboard
├── components/
│   ├── geographic-data-dashboard.tsx     # Componente principal del catálogo e índice de búsqueda
│   ├── search-results.tsx                # Vista de resultados agrupados (Clases, Subclases, Objetos, Atributos)
│   └── ui/                               # Componentes base de shadcn/Radix UI
├── data/
│   ├── catalogo-idesob.json              # Base de datos jerárquica principal del catálogo IDESoB
│   └── DByF_V2.0_IDERA_2022.json         # Catálogo de Datos Básicos y Fundamentales (IDERA)
├── hooks/
│   └── use-debounce.ts                   # Hook para retrasar la ejecución de la búsqueda al escribir
├── lib/
│   ├── search-utils.tsx                  # Funciones normalize(), highlight() y getObjectSlug()
│   ├── types.ts                          # Interfaces TypeScript del catálogo
│   └── utils.ts                          # Helper cn() de Tailwind
├── public/
│   ├── logo-idesob.png                   # Logo institucional IDESoB
│   ├── logo-uns.png                      # Logo institucional UNS
│   └── downloads/
│       ├── planillas/                    # Archivos .docx de definición por objeto
│       └── xml/                          # Archivos .xml (ISO 19110) por objeto
├── .dockerignore                         # Exclusiones para optimizar el contexto de Docker
├── dockerfile                            # Build multi-stage con Node 20 Alpine y caché de pnpm
└── next.config.mjs                       # Configurado con output: 'standalone'
```

---

## 3. Modelo de Datos y Tipado (`lib/types.ts`)

Se centralizaron las interfaces del catálogo en `lib/types.ts` para compartirlas entre el dashboard y el componente de búsqueda. Incluye soporte opcional para archivos descargables (`archivo_xml` y `archivo_docx`) en cada objeto:

```ts
export interface DominioValor {
  codigo: string
  etiqueta: string
  definicion: string
  observaciones: string
}

export interface Atributo {
  codigo: string
  denominacion: string
  tipo: string
  definicion: string
  observaciones: string
  dominio: DominioValor[]
}

export interface Objeto {
  nombre: string
  codigo: string
  geometria: string
  definicion: string
  atributos: Atributo[]
  archivo_xml?: string
  archivo_docx?: string
}

export interface Subcategoria {
  nombre: string
  codigo: string
  contenido: string
  objetos: Objeto[]
}

export interface Categoria {
  nombre: string
  codigo: string
  contenido: string
  color: string
  subcategorias: Subcategoria[]
}
```

---

## 4. Motor de Búsqueda Global y Utilidades

Se reemplazó el filtrado básico por nivel por un **motor de búsqueda global transversal** que busca simultáneamente en **Clases**, **Subclases**, **Objetos** y **Atributos** por nombre o código, ignorando tildes y mayúsculas/minúsculas.

### 4.1. Hook `useDebounce` (`hooks/use-debounce.ts`)

Evita recalcular el filtrado en cada pulsación de tecla aplicando un retardo de `200ms`:

```ts
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

### 4.2. Normalización y Resaltado (`lib/search-utils.tsx`)

- `normalize(s)`: Descompone caracteres Unicode (`NFD`), elimina marcas diacríticas (`[\u0300-\u036f]`) y pasa a minúsculas.
- `highlight(text, q)`: Encuentra la coincidencia sobre el texto normalizado pero preserva los caracteres originales (con tildes y mayúsculas) al envolver el fragmento coincidente en `<mark className="bg-yellow-200 text-black px-1 rounded">`.
- `getObjectSlug(codigo, nombre)`: Genera el identificador amigable para consultas WFS.

```tsx
import React from "react";

export const normalize = (s: string = "") =>
  s.toString()
   .normalize("NFD")
   .replace(/[\u0300-\u036f]/g, "")
   .toLowerCase()
   .trim()

export const highlight = (text: string, q: string) => {
  if (!q) return <>{text}</>;
  const normalizedText = normalize(text);
  const normalizedQ = normalize(q);

  const index = normalizedText.indexOf(normalizedQ);
  if (index === -1) return <>{text}</>;

  const before = text.substring(0, index);
  const match = text.substring(index, index + q.length);
  const after = text.substring(index + q.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-black px-1 rounded">{match}</mark>
      {after}
    </>
  );
};
```

### 4.3. Indexación en Memoria (`useMemo`)

Dentro de `components/geographic-data-dashboard.tsx`:
1. **`indice`**: Se construye una única vez al cargar `catalogo-idesob.json`. Recorre categorías, subcategorías, objetos y atributos, precalculando `textoBusqueda: normalize(nombre + " " + codigo)`. Para los atributos, agrupa en un `Map` todos los objetos que utilizan cada atributo.
2. **`searchResults`**: Cuando `debouncedSearchTerm` tiene 2 o más caracteres (`q.length >= 2`), filtra las 4 colecciones del índice y activa la vista `<SearchResults />`.

### 4.4. Vista de Resultados (`components/search-results.tsx`)

- Muestra el conteo total de resultados y los divide en 4 grillas: **Clases**, **Subclases**, **Objetos** y **Atributos**.
- **Navegación directa e interactiva**:
  - Clic en **Clase**: abre sus subcategorías (`handleCategorySelect`).
  - Clic en **Subclase**: abre sus objetos asignando su categoría padre (`handleSubcategorySelect`).
  - Clic en **Objeto** (o en el badge de un objeto dentro de la tarjeta de un **Atributo**): navega a la vista de objetos de esa subcategoría, limpia el buscador y abre automáticamente el modal de detalle de atributos del objeto seleccionado mediante el estado controlado `openObjetoCodigo`.

---

## 5. Personalizaciones del Dashboard (`components/geographic-data-dashboard.tsx`)

1. **Identidad Visual IDESoB / UNS**:
   - Header sticky con gradiente verde (`from-[#1a4731] via-[#2d6a4f] to-[#40916c]`).
   - Logos de IDESoB (`https://idesob.uns.edu.ar/`) a la izquierda y UNS (`https://www.uns.edu.ar/`) a la derecha.
   - Cuadro informativo con alcance, campo de aplicación, versión `2.1` (año `2026`) y enlaces a fuentes oficiales (IGN, IDERA, ISO/TC211, DGIWG, IGM Ecuador).
2. **Soporte Multi-Geometría (`getGeometryTypes`)**:
   - Un objeto puede tener múltiples geometrías (ej. `"Punto, Polígono"` o `"Ráster"`). La función devuelve un array con todos los tipos detectados y renderiza un badge coloreado por cada uno.
3. **Control de Apertura de Modal (`openObjetoCodigo`)**:
   - El componente `<Dialog>` de cada objeto está controlado por `open={openObjetoCodigo === objeto.codigo}`, permitiendo abrirlo tanto desde el botón `"Ver atributos"` como al saltar desde un resultado de búsqueda global.
4. **Atributos de tipo `"PERFIL DE OG"`**:
   - Cuando `atributo.tipo === "PERFIL DE OG"`, se convierte automáticamente en un enlace externo hacia la carpeta de perfiles en Google Drive.
5. **Menú de Descargas y Metadatos por Objeto**:
   - **WFS**: Enlace directo al servicio WFS de IDERA.
   - **Catálogo (XML ISO 19110)**: Descarga directa si el objeto define `archivo_xml`.
   - **Planilla de definición (DOCX)**: Descarga directa si el objeto define `archivo_docx`.
   - **Catálogo de Metadatos**: Botón directo a GeoNetwork (`https://catalogo-ig.labgeot.uns.edu.ar/geonetwork/srv/spa/catalog.search#/home`).

---

## 6. Recursos Estáticos y Descargas (`public/`)

Para replicar las descargas y logos en otro proyecto, asegurarse de copiar:
- `public/logo-idesob.png` y `public/logo-uns.png`
- `public/downloads/planillas/*.docx` (Planillas de definición de objetos geográficos)
- `public/downloads/xml/*.xml` (Catálogos individuales en formato XML ISO 19110)

Las rutas dentro de `data/catalogo-idesob.json` apuntan a `/downloads/xml/...` y `/downloads/planillas/...`.

---

## 7. Configuración de Producción y Docker

Se optimizó el empaquetado para que la imagen final de Docker sea liviana, segura (usuario no-root) y rápida de compilar mediante BuildKit y el modo `standalone` de Next.js.

### 7.1. `next.config.mjs`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
```

### 7.2. `dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

# ---- Dependencies & Build ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

# ---- Production Image ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

### 7.3. `.dockerignore`

Excluye `node_modules/`, `.pnpm-store/`, `.next/`, `out/`, `.git/`, archivos de entorno (`.env*`), documentación (`*.md`) y estilos sin uso (`styles/`).

---

## 8. Pasos para Replicar en Otro Entorno

### Opción A: Ejecución Local (Desarrollo / Producción con Node)

1. **Clonar el repositorio o copiar los archivos configurados**:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd Visualizador_Catalogo_OG
   ```
2. **Instalar dependencias con `pnpm`**:
   ```bash
   pnpm install
   ```
3. **Levantar entorno de desarrollo**:
   ```bash
   pnpm run dev
   ```
   La aplicación estará disponible en `http://localhost:3000`.
4. **Compilar para producción (opcional)**:
   ```bash
   pnpm run build
   pnpm run start
   ```

### Opción B: Despliegue con Docker

1. **Construir la imagen** (asegurándose de tener BuildKit activo, habilitado por defecto en versiones modernas de Docker):
   ```bash
   docker build -t visualizador-catalogo-idesob .
   ```
2. **Ejecutar el contenedor**:
   ```bash
   docker run -d -p 3000:3000 --name catalogo-idesob visualizador-catalogo-idesob
   ```
3. Acceder desde el navegador en `http://localhost:3000`.

