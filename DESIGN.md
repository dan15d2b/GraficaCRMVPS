# Design & Motion Engineering Standards

Princípios aplicados globalmente no sistema, baseados em **emil-design-eng**, **animate**, **animation-performance**, **mobile-native** e **remove-animations**:

## 1. Curvas e Durações
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` para entradas e interações de resposta rápida (`--duration-fast: 140ms`, `--duration-base: 180ms`, `--duration-slow: 280ms`).
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` para deslocamentos internos em estado contínuo.
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` para gavetas laterais e folhas inferiores.
- Transições de interface sempre abaixo de `300ms`; saídas mais ágeis que entradas.
- **Nunca usar `transition-all`**: apenas propriedades explícitas (`background-color`, `border-color`, `color`, `opacity`, `transform`/`scale`).

## 2. Física & Origem
- Controles clicáveis usam micro-feedback tátil (`active:scale-[0.97]`).
- Diálogos e popovers partem de `scale(0.96)` (nunca `scale(0)`) e respeitam `data-side` no gatilho de origem.
- Comandos por teclado de alta frequência (`⌘K` `PaletaDeDestinos`) abrem e fecham sem animação (`ds-sem-animacao`).
- Números dinâmicos (contadores, horários, quantias) usam `tabular-nums`.

## 3. Performance & Mobile Native
- Somente propriedades compositor (`transform`/`translate`/`scale`/`opacity`) são animadas em estado contínuo.
- Trava global contra auto-zoom em touch (`font-size: max(16px, 1em)` em `@media (hover: none) and (pointer: coarse)`), `touch-action: manipulation` em botões/links e `-webkit-tap-highlight-color: transparent`.
- Preserva `overflow-x: hidden; overflow-x: clip;` em `html` e `body` para não quebrar `position: sticky`, e respeita `@media (prefers-reduced-motion: reduce)`.
