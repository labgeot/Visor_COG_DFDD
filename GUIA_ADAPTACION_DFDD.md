# Guía de Adaptación y Replicación — Visualizador DFDD (Baseline 2013-1.00)

Este documento registra todos los pasos realizados para adaptar la arquitectura descrita en [GUIA_REPLICACION_COG.md](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/GUIA_REPLICACION_COG.md) a los datos del libro Excel **`04a_DFDD BL 2013-1.00.xlsx`** (*DGIWG Feature Data Dictionary, Baseline 2013-1.00*).

---

## Tabla de Contenidos

1. [Análisis de la Fuente de Datos (`04a_DFDD BL 2013-1.00.xlsx`)](#1-análisis-de-la-fuente-de-datos-04a_dfdd-bl-2013-100xlsx)
2. [Diferencias Clave frente al Catálogo IDERA / IDESoB](#2-diferencias-clave-frente-al-catálogo-idera--idesob)
3. [Paso 1 — Script de Extracción y Generación de JSON (`scripts/build-dfdd-data.py`)](#3-paso-1--script-de-extracción-y-generación-de-json-scriptsbuild-dfdd-datapy)
4. [Paso 2 — Modelo de Datos y Tipado (`lib/types.ts` y `lib/catalog-types.ts`)](#4-paso-2--modelo-de-datos-y-tipado-libtypests-y-libcatalog-typests)
5. [Paso 3 — Motor de Búsqueda Global y Debounce](#5-paso-3--motor-de-búsqueda-global-y-debounce)
6. [Paso 4 — Adaptación del Dashboard e Interfaz (`components/geographic-data-dashboard.tsx` y `app/layout.tsx`)](#6-paso-4--adaptación-del-dashboard-e-interfaz-componentsgeographic-data-dashboardtsx-y-applayouttsx)
7. [Paso 5 — Configuración de Producción y Docker](#7-paso-5--configuración-de-producción-y-docker)
8. [Paso 6 — Ejecución, Verificación y Despliegue](#8-paso-6--ejecución-verificación-y-despliegue)

---

## 1. Análisis de la Fuente de Datos (`04a_DFDD BL 2013-1.00.xlsx`)

El archivo `04a_DFDD BL 2013-1.00.xlsx` contiene el diccionario oficial del **DGIWG Feature Data Dictionary (DFDD)** correspondiente a la línea base **2013-1.00** (preparado el 26 de mayo de 2014 por el *Defence Geospatial Information Working Group* — [dgiwg.org](https://www.dgiwg.org/)).

### Contexto Normativo DGIWG

- **ISO 19126** (*Feature concept dictionaries and registers*) e **ISO 19135** (*Procedures for item registration*): el DFDD opera como diccionario semántico independiente de esquemas de aplicación para evitar ambigüedades entre naciones y sistemas C2/GIS de defensa.
- **ISO 19110** (*Methodology for feature cataloguing*): sirve de base conceptual para catálogos de objetos geográficos y esquemas de aplicación (como MGCP).
- **Codificación `5-3-1` (DIGEST / FACC)**: estructura heredada de DIGEST (*Digital Geographic Information Exchange Standard*) y FACC (*Feature and Attribute Coding Catalogue*) para identificar unívocamente conceptos de objeto (5 caracteres, ej. `FA005`), atributos (3 caracteres, ej. `AWB`) y valores enumerados.
- **Evolución hacia DGIF**: en la arquitectura vigente de DGIWG (*Defence Geospatial Information Framework*), el DFDD fue sucedido funcionalmente por **DGIWG 206 — DGFCD** (*Defence Geospatial Feature Concept Dictionary*), junto con **DGIWG 205 (DGIM)**, **DGIWG 207 (DGRWI)** y la guía **DGIWG 500**.

El libro Excel está compuesto por **9 hojas**:

| Hoja | Contenido | Registros útiles |
| --- | --- | --- |
| `Cover` | Metadatos generales, URIs oficiales (`https://www.dgiwg.org/FAD/` y mirror `https://geo.aitcnet.org/FAD/`) y diccionario de columnas | — |
| `Groups` | Grupos temáticos de nivel superior (`01`–`10`, `20`–`23`) | 14 grupos |
| `Subgroups` | Subgrupos temáticos (`01.01`–`23.02`) vinculados a cada grupo | 82 subgrupos |
| `FeatureConcepts (OG)` | Conceptos de objetos geográficos con código 5-3-1 (ej. `FA005`), Short Name, definición, descripción, alias, Item Identifier y matriz de pertenencia (`X`) en columnas `26..107` | 935 conceptos únicos (1.639 membresías) |
| `AttributeConcepts` | Conceptos de atributos con código 5-3-1 (ej. `AWB`), multiplicidad, colección, datatype, magnitud física, unidad de medida, códigos GIFD/MGCP y matriz de pertenencia (`X`) en columnas `26..107` | 1.774 atributos únicos (4.189 membresías) |
| `Datatypes(Tcaract del OG)` | Especificación de tipos de datos (`«enumeration»`, `structuredText`, `real`, `text`, `complex`, etc.), longitudes, rangos y subcampos para tipos complejos | 872 tipos de datos |
| `DatatypeListedValues(DOMINIOS)` | Valores enumerados de dominio vinculados por `Datatype Link` | 10.769 valores en 705 dominios |
| `PhysicalQuantities` | Magnitudes físicas asociadas a atributos medibles | 53 magnitudes |
| `UnitsOfMeasure` | Unidades de medida (con código UNECE Rec. 20) vinculadas a magnitudes físicas | 296 unidades |

---

## 2. Diferencias Clave frente al Catálogo IDERA / IDESoB

| Aspecto | Catálogo IDERA / IDESoB | DFDD Baseline 2013-1.00 |
| --- | --- | --- |
| **Códigos de Categoría / Grupo** | Numéricos `1`–`12` | Textuales de 2 dígitos: `01`–`10` y `20`–`23` (con `AlphaCode`) |
| **Códigos de Subcategoría / Subgrupo** | Numéricos de 4 dígitos (`101`, etc.) | Textuales con punto (`01.01`–`23.02`) |
| **Códigos de Objeto** | Numéricos de 6 dígitos (`10101`) | Alfanuméricos `5-3-1 Code` (ej. `FA005`, `BK010`), más `Short Name` e `Item Identifier` |
| **Pertenencia a Subgrupos** | Relación 1:1 (cada objeto pertenece a una sola subcategoría) | Relación N:M (un `FeatureConcept` puede tener `X` en hasta 10 subgrupos) |
| **Relación Objeto ↔ Atributos** | Lista explícita de atributos por objeto | En el DFDD, tanto `FeatureConcepts` como `AttributeConcepts` se clasifican de forma independiente por **Subgrupo** |
| **Geometría y DByF** | Campo `geometria` (Punto/Línea/Polígono) e indicador DByF | No aplica en el diccionario conceptual DFDD; se sustituye por enlace directo al registro DGIWG FAD y membresías multi-subgrupo |
| **Subgrupos sin Objetos** | Todos tienen objetos | Los subgrupos `03.09` (*Space Transportation*) y `22.02` (*Portrayal*) tienen `0` Feature Concepts pero sí Attribute Concepts |
| **Subgrupos sin Atributos** | — | Los subgrupos `10.02` (*Climate Conditions*) y `23.02` (*Dataset*) tienen `0` Attribute Concepts pero sí Feature Concepts |

---

## 3. Paso 1 — Script de Extracción y Generación de JSON (`scripts/build-dfdd-data.py`)

Se creó el script reproducible [build-dfdd-data.py](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/scripts/build-dfdd-data.py) con `openpyxl` (`read_only=True, data_only=True`) que realiza:

1. **Lectura de `Groups` y `Subgroups`**: aplica *forward-fill* en la columna `Group (Link)` de `Subgroups` y verifica la correspondencia exacta de los 82 subgrupos con las columnas `26..107` de la matriz.
2. **Carga de diccionarios de soporte**: indexa `PhysicalQuantities`, `UnitsOfMeasure` (con *forward-fill* de magnitud física), `Datatypes(Tcaract del OG)` (agrupando subcampos de los 4 tipos `complex`) y `DatatypeListedValues(DOMINIOS)` (con *forward-fill* de `Datatype Link`).
3. **Procesamiento de `FeatureConcepts (OG)`**: extrae código 5-3-1, `shortName`, `nombre`, `definicion`, `descripcion`, `aliases`, `itemIdentifier`, `url` y todas las membresías de subgrupo marcadas con `X`, ordenando alfabéticamente dentro de cada subgrupo.
4. **Procesamiento de `AttributeConcepts`**: extrae cada atributo, lo vincula con su `datatype`, `cantidadFisica`, `unidadRecomendada` y `dominio` completo, y registra sus códigos en `atributosCodigos` de cada subgrupo correspondiente.
5. **Salida generada**:
   - [dfdd-catalogo.json](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/data/dfdd-catalogo.json) (~751,5 KB): jerarquía de 14 Grupos → 82 Subgrupos → Feature Concepts y códigos de atributos por subgrupo.
   - [dfdd-atributos.json](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/public/dfdd-atributos.json) (~6,0 MB en formato compacto): diccionario completo de los 1.774 Attribute Concepts con sus tipos de datos, unidades y 10.769 valores de dominio.

Comando para regenerar los JSON si cambia el Excel:

```bash
python scripts/build-dfdd-data.py
```

---

## 4. Paso 2 — Modelo de Datos y Tipado (`lib/types.ts` y `lib/catalog-types.ts`)

Se creó [types.ts](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/lib/types.ts) siguiendo la estructura indicada en `GUIA_REPLICACION_COG.md` y adaptada al DFDD:

- `DominioValor`: `codigo` (string), `shortName`, `etiqueta`, `definicion`, `observaciones`, `aliases`, `itemIdentifier`, `url`.
- `DatatypeCampo` y `DatatypeInfo`: metadatos del tipo de dato (`especificacion`, `longitud`, `rangoMin`, `rangoMax`, `estructura`, `nota`, `campos` complejos).
- `PhysicalQuantityInfo` y `UnitOfMeasureInfo`: magnitud física y unidad de medida recomendada (incluyendo códigos UNECE).
- `AtributoDetalle`: definición completa del `AttributeConcept` más `subgrupos: string[]` y `dominio: DominioValor[] | null`.
- `Objeto`, `Subcategoria` y `Categoria`: con códigos textuales (`"01"`, `"01.01"`, `"FA005"`), `alphaCode`/`shortName`, `itemIdentifier`, `url`, `subgrupos` y `atributosCodigos`.

El archivo [catalog-types.ts](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/lib/catalog-types.ts) reexporta todo desde `./types` para mantener compatibilidad con importaciones existentes.

---

## 5. Paso 3 — Motor de Búsqueda Global y Debounce

### 5.1. Hook `useDebounce` ([use-debounce.ts](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/hooks/use-debounce.ts))
Se implementó exactamente según `GUIA_REPLICACION_COG.md` §4.1 con retardo configurable (`200 ms`) aplicado al término de búsqueda en el dashboard.

### 5.2. Utilidades e Índice de Búsqueda ([search-utils.tsx](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/lib/search-utils.tsx))
Se consolidó la lógica en `lib/search-utils.tsx` (reemplazando al anterior `lib/search-utils.ts`):
- `normalize()`, `getHighlightSegments()`, `highlight()`, `makeSnippet()` y `getObjectSlug()`.
- `buildSearchIndex(data, atributosDetalle)`:
  - Indexa los **14 Grupos** y **82 Subgrupos** (por código, `alphaCode`, nombre, definición y descripción).
  - Deduplica los **935 Feature Concepts** por su `5-3-1 Code` (evitando resultados repetidos cuando un concepto aparece en múltiples subgrupos) y almacena todas sus referencias en `refs: ObjetoRef[]`.
  - Indexa los **1.774 Attribute Concepts** por `5-3-1 Code`, `shortName`, nombre, alias, tipo/datatype, magnitud física, unidad recomendada, códigos adicionales y **todos sus valores de dominio**.
- `searchIndex(index, query)`: calcula relevancia ponderada (`score`) cuando `q.length >= 2`.

### 5.3. Vista de Resultados ([search-results.tsx](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/components/search-results.tsx))
Adaptada para mostrar:
- Conteo total y pills de salto rápido a **Grupos**, **Subgrupos**, **Feature Concepts** y **Attribute Concepts**.
- Tarjetas de **Feature Concepts** deduplicadas con chips interactivos de cada subgrupo al que pertenece el concepto.
- Tarjetas de **Attribute Concepts** con badges de datatype, unidad recomendada, cantidad de valores de dominio, subgrupos clickeables y botón directo `"Ver detalle"` que abre el modal de especificación del atributo.

---

## 6. Paso 4 — Adaptación del Dashboard e Interfaz (`components/geographic-data-dashboard.tsx` y `app/layout.tsx`)

En [layout.tsx](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/app/layout.tsx) se actualizaron `title` y `description` al DGIWG DFDD Baseline 2013-1.00.

En [geographic-data-dashboard.tsx](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/components/geographic-data-dashboard.tsx):
1. **Header Sticky y Banner de Portada**: gradiente verde institucional (`from-[#1a4731] via-[#2d6a4f] to-[#40916c]`), badges de estándares (`ISO 19110`, `ISO 19126`, `ISO 19135`), metadatos extraídos de la hoja `Cover`, métricas en vivo (`14` Grupos, `82` Subgrupos, `935` Feature Concepts, `1.774` Atributos) y enlaces al **DGIWG FAD Registry** y su mirror **AITCNet**.
2. **Paleta de Grupos (`groupColors`)**: mapeo completo de los códigos `"01"`–`"10"` y `"20"`–`"23"` con iconografía `lucide-react`.
3. **Navegación con Breadcrumbs**: ruta interactiva `Grupos > Grupo > Subgrupo` y buscador global con botón de limpieza y tecla `Escape`.
4. **Vista de Subgrupo con Pestañas (`Tabs`)**:
   - Pestaña **Feature Concepts** y pestaña **Attribute Concepts**, con filtro local instantáneo dentro del subgrupo.
   - Si un subgrupo carece de Feature Concepts (`03.09` y `22.02`), se selecciona automáticamente la pestaña **Attribute Concepts**.
5. **Diálogos Controlados**:
   - **Detalle de Feature Concept (`openObjeto`)**: `5-3-1 Code`, `Short Name`, `Item Identifier`, definición, descripción, alias, subgrupos clickeables para navegar entre ellos, enlaces externos al FAD Registry, exportación a JSON y listado filtrable de los Attribute Concepts del subgrupo activo.
   - **Detalle de Attribute Concept (`openAtributo`)**: especificación completa del Datatype (incluyendo subcampos para tipos `complex`, longitud, rangos y estructura), magnitud física, unidad de medida recomendada (con código UNECE), códigos GIFD/MGCP, dominio de valores enumerados con buscador interno y exportación a JSON.

---

## 7. Paso 5 — Configuración de Producción y Docker

1. **[next.config.mjs](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/next.config.mjs)**: habilitado `output: 'standalone'` para generar el servidor autocontenido en `.next/standalone`.
2. **[dockerfile](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/dockerfile)**: build multi-stage basado en `node:20-alpine` con usuario no-root `nextjs` y puerto `3000`.
3. **[.dockerignore](file:///C:/Users/feder/OneDrive/Documentos/GitHub/DFDD/.dockerignore)**: excluye `node_modules/`, `.next/`, `out/`, `.git/`, `.env*`, `*.md`, `*.xlsx`, `*.xlsm`, `scripts/` y `styles/`.

---

## 8. Paso 6 — Ejecución, Verificación y Despliegue

### Desarrollo y Build Local

```bash
# 1. Regenerar JSON desde el Excel (opcional si ya existen en data/ y public/)
python scripts/build-dfdd-data.py

# 2. Instalar dependencias (npm o pnpm)
npm ci

# 3. Verificación de tipos TypeScript
npm run type-check

# 4. Compilación de producción (genera .next/standalone)
npm run build

# 5. Ejecutar servidor de desarrollo o producción standalone
npm run dev
# o en producción (copiando .next/static y public dentro de .next/standalone):
node .next/standalone/server.js
```

### Resultados de Verificación Ejecutados

- `python scripts/build-dfdd-data.py`: generación exitosa de `data/dfdd-catalogo.json` (`751.5 KB`, 14 grupos, 82 subgrupos, 935 Feature Concepts únicos) y `public/dfdd-atributos.json` (`6042.6 KB`, 1.774 Attribute Concepts y 10.769 valores de dominio).
- `npm run type-check` (`tsc --noEmit`): finalizado con código `0` y sin errores de tipado.
- `npm run build` (`next build`): compilación estática y generación de `.next/standalone/server.js` finalizadas con código `0`.
- Prueba funcional del servidor standalone (`node .next/standalone/server.js`): respuestas HTTP `200` verificadas tanto en `/` (renderizando `DGIWG Feature Data Dictionary`) como en `/dfdd-atributos.json` (`6.187.644` bytes).

### Despliegue con Docker

> **Nota sobre `pnpm-lock.yaml` / `package-lock.json`**: si se utiliza el `dockerfile` con `pnpm install --frozen-lockfile`, asegúrese de regenerar primero `pnpm-lock.yaml` ejecutando `pnpm install` en un entorno con `pnpm`, o bien adaptar el `COPY` / `RUN` del `dockerfile` para usar `package-lock.json` y `npm ci`.

```bash
docker build -t visualizador-dfdd-2013 .
docker run -d -p 3000:3000 --name visualizador-dfdd visualizador-dfdd-2013
```
