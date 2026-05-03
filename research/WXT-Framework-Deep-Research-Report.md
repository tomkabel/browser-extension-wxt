# WXT Browser Extension Framework: Deep Research Report

_Generated: 2026-04-30 | Sources: GitHub API, web search | Confidence: High_

## Executive Summary

WXT is a next-generation, open-source framework (~10K GitHub stars, MIT License) for building browser extensions, inspired by Nuxt's developer experience. It provides file-based entrypoints, HMR, cross-browser support (Chrome, Firefox, Safari, Edge), and first-class support for React, Vue, Svelte, and Angular. The ecosystem includes official examples, reusable hook libraries, module-layer architectures, and starter templates with modern UI stacks.

---

## 1. Core WXT Framework & Official Resources

### 1.1 WXT Framework (Main Repository)

- **Repository**: [wxt-dev/wxt](https://github.com/wxt-dev/wxt) | **License**: MIT | **Stars**: ~10K
- **Technical Architecture**: Vite-based build system with file-based entrypoint discovery; auto-generated manifest; multi-browser targeting (MV2/MV3); module system for extensible build/runtime code
- **Key Patterns**:
  - `defineBackground()`, `defineContentScript()`, `defineUnlistedScript()` for entrypoint definition
  - `#imports` virtual module for framework-agnostic imports
  - `wxt/utils/storage` wrapper around browser.storage API
  - Hook system (`build:manifestGenerated`, `config:resolved`, etc.) for build customization
- **Reusability**: `@wxt-dev/i18n`, `@wxt-dev/storage`, `@wxt-dev/analytics` as standalone packages

### 1.2 Official Examples

- **Repository**: [wxt-dev/examples](https://github.com/wxt-dev/examples) | **License**: MIT
- **Contains 30+ examples**: side-panel, vue-overlay, react-content-script-ui, svelte-custom-store, vue-storage-composable, content-script-session-storage, background-message-forwarder, inject-script, offscreen-document-setup, etc.
- **Direct fetch command**:
  ```sh
  npx giget@latest gh:wxt-dev/examples/examples/<example-name>
  ```

---

## 2. High-Value Starter Templates

### 2.1 Sidepanel + Tailwind 4.0 + shadcn/ui

- **Repository**: [evanlong-me/sidepanel-extension-template](https://github.com/evanlong-me/sidepanel-extension-template) | **MIT**
- **Architecture**: WXT + Tailwind CSS 4.0 + shadcn/ui; sidepanel entrypoint; Chrome side panel API
- **Reusability**: Standalone sidebar UI pattern; shadcn/ui component integration in extensions

### 2.2 WXT + React + Shadcn + tRPC

- **Repository**: [poweroutlet2/browser-extension-starter](https://github.com/poweroutlet2/browser-extension-starter) | **MIT**
- **Architecture**: Full-stack React pattern; tRPC for type-safe background↔popup communication; shadcn/ui
- **Reusability**: Type-safe messaging pattern between entrypoints; React state management in popup

### 2.3 WXT + Nuxt UI v3 (Vue 3)

- **Repository**: [HugoRCD/wxt-nuxt-ui-starter](https://github.com/HugoRCD/wxt-nuxt-ui-starter) | **MIT**
- **Architecture**: WXT with Nuxt UI v3 for Vue 3-based extensions; accessible components
- **Reusability**: Vue composables pattern; Nuxt UI component library in extensions

### 2.4 WXT + Svelte 5 + Tailwind 4

- **Repository**: [oneezy/svelte-5-extension](https://github.com/oneezy/svelte-5-extension) | **MIT**
- **Architecture**: Svelte 5 Runes for state management; Tailwind CSS 4; modern Svelte patterns
- **Reusability**: Svelte reactive patterns; custom store integration

### 2.5 WXT + Angular

- **Repository**: [lacolaco/wxt-angular-starter](https://github.com/lacolaco/wxt-angular-starter) | **MIT**
- **Architecture**: Angular standalone components with WXT; injection patterns
- **Reusability**: Angular DI in extension context

### 2.6 WXT + React Boilerplate

- **Repository**: [pnd280/wxt-react-boilerplate](https://github.com/pnd280/wxt-react-boilerplate) | **MIT**
- **Architecture**: Basic React + WXT scaffold; entrypoint organization
- **Reusability**: Clean project initialization pattern

---

## 3. Reusable Hook Libraries & Module Systems

### 3.1 WXT React Hooks Collection

- **Repository**: [pavi2410/wxt-hooks](https://github.com/pavi2410/wxt-hooks) | **MIT** | **Updated**: 2025-12
- **Architecture**: Custom React hooks (`useStorage`, `useMessage`, `useTab`, etc.) specifically for WXT extension contexts
- **Reusability**: Drop-in hooks for common extension operations; storage abstraction; tab detection

### 3.2 WXT Module Layers (Nuxt-like Architecture)

- **Repository**: [davestewart/wxt-module-layers](https://github.com/davestewart/wxt-module-layers) | **MIT**
- **Architecture**: Nuxt-like layers functionality; module ordering with numeric prefixes (`1.layer.ts`, `2.layer.ts`); shared module code across extensions
- **Reusability**: Module code reuse across multiple extension projects; layer-based architecture

---

## 4. Feature-Specific Repositories

### 4.1 Side Panel / Sidebar Implementations

| Repository                                                                        | Description                                       | License |
| --------------------------------------------------------------------------------- | ------------------------------------------------- | ------- |
| [pikum99/wxt-side-panel-sample](https://github.com/pikum99/wxt-side-panel-sample) | React side panel with iframe embedding and toggle | MIT     |
| [nitzanpap/auto-tab-groups](https://github.com/nitzanpap/auto-tab-groups)         | Tab grouping with sidebar UI + rules modal        | MIT     |
| [mcintyre94/Orbit](https://github.com/mcintyre94/Orbit)                           | Solana wallet organizer with sidebar              | MIT     |

### 4.2 Content Script & Injection Patterns

| Repository                                                                          | Description                             | License |
| ----------------------------------------------------------------------------------- | --------------------------------------- | ------- |
| [aiktb/furiganamaker](https://github.com/aiktb/furiganamaker)                       | Japanese furigana injection on any page | MIT     |
| [miyaoka/wxt-youtube-streamtime](https://github.com/miyaoka/wxt-youtube-streamtime) | YouTube live stream time display        | MIT     |
| [tomowang/peek-preview](https://github.com/tomowang/peek-preview)                   | Arc-like peek preview                   | MIT     |
| [diragb/slopmuter-extension](https://github.com/diragb/slopmuter-extension)         | X/Twitter content filtering             | MIT     |

### 4.3 Storage & State Management

| Repository                                                              | Description                     | License |
| ----------------------------------------------------------------------- | ------------------------------- | ------- |
| [SuniRein/read-it-later](https://github.com/SuniRein/read-it-later)     | Read-it-later list with storage | MIT     |
| [yebei199/meow-memorizing](https://github.com/yebei199/meow-memorizing) | Vocabulary learning extension   | MIT     |
| [CMOISDEAD/devtab](https://github.com/CMOISDEAD/devtab)                 | New tab page with dev focus     | MIT     |

### 4.4 AI / LLM Integration Extensions

| Repository                                                                                      | Description                               | License |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- |
| [PerceptivePenguin/GPT-exporter](https://github.com/PerceptivePenguin/GPT-exporter)             | Export ChatGPT to Markdown + AI summaries | MIT     |
| [brkunver/llm-toolbox](https://github.com/brkunver/llm-toolbox)                                 | Multi-LLM interface extension             | MIT     |
| [brkunver/chatgpt-export-conversation](https://github.com/brkunver/chatgpt-export-conversation) | ChatGPT export                            | MIT     |
| [wenyuanw/quick-prompt](https://github.com/wenyuanw/quick-prompt)                               | Prompt management & quick input           | MIT     |
| [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog)                               | Immersive translate                       | MIT     |

---

## 5. Technical Documentation & Deep Resources

### 5.1 Official WXT Documentation

- **URL**: [wxt.dev](https://wxt.dev)
- **Key Docs**:
  - [Project Structure](https://wxt.dev/guide/essentials/project-structure) — Flat folder convention (`entrypoints/`, `components/`, `hooks/`, `utils/`, `modules/`)
  - [Storage API](https://wxt.dev/guide/essentials/storage) — `wxt/utils/storage` wrapper
  - [Hooks System](https://wxt.dev/guide/essentials/config/hooks.html) — Build lifecycle hooks
  - [Entrypoints](https://wxt.dev/guide/essentials/entrypoints) — Background, Content Scripts, Popup, Sidepanel, Options

### 5.2 Community Articles

- **LogRocket Blog**: [Developing web extensions with WXT](https://blog.logrocket.com/developing-web-extensions-wxt-library/) — DX benefits, Vite/HMR integration, storage abstraction
- **marmelab**: [Building AI-Powered Browser Extensions With WXT](https://marmelab.com/blog/2025/04/15/browser-extension-form-ai-wxt.html) — Real-world FormAIdable case study
- **2025 Framework Comparison**: [State of Browser Extension Frameworks](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) — WXT vs Plasmo vs CRXJS analysis

### 5.3 Framework Module Architecture (DeepWiki)

- **URL**: [DeepWiki: Framework Module Architecture](https://deepwiki.com/wxt-dev/wxt/7.1-framework-module-architecture)
- **Covers**: `@wxt-dev/module-react`, `@wxt-dev/module-vue`, `@wxt-dev/module-svelte`, `@wxt-dev/module-solid` — Vite plugin integration, auto-import configuration

---

## 6. Key Architectural Patterns for Reuse

### 6.1 Messaging / State Flow (from wxt-dev/examples)

```typescript
// Background: browser.runtime.sendMessage / onMessage
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg) => {
    // Handle messages from content/popup
  })
})

// Content: browser.runtime.sendMessage
import { sendMessage } from 'wxt/utils/messaging'
```

### 6.2 Storage Pattern (from `vue-storage-composable` example)

```typescript
// Use WXT's storage wrapper
import { storage } from 'wxt/utils/storage'

// Reactive Vue composable wrapping storage
import { ref, watch } from 'vue'
export function useStorage<T>(key: string, defaultValue: T) {
  const state = ref<T>(defaultValue)
  // Load from storage, watch for changes
}
```

### 6.3 Multi-Background Modularization (from WXT Issue #1038)

```typescript
// entrypoints/background/index.ts
const scripts = import.meta.glob<{ default: () => void }>('./*.background.ts', { eager: true })
export default defineBackground(() => {
  Object.values(scripts).map((script) => script.default.main())
})
```

---

## 7. Summary Table

| #   | Repository                                                                                              | Key Feature           | License | Stars |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------- | ------- | ----- |
| 1   | [wxt-dev/wxt](https://github.com/wxt-dev/wxt)                                                           | Core framework        | MIT     | ~10K  |
| 2   | [wxt-dev/examples](https://github.com/wxt-dev/examples)                                                 | 30+ official examples | MIT     | -     |
| 3   | [pavi2410/wxt-hooks](https://github.com/pavi2410/wxt-hooks)                                             | React hooks library   | MIT     | -     |
| 4   | [davestewart/wxt-module-layers](https://github.com/davestewart/wxt-module-layers)                       | Nuxt-like layers      | MIT     | -     |
| 5   | [evanlong-me/sidepanel-extension-template](https://github.com/evanlong-me/sidepanel-extension-template) | Sidepanel + shadcn    | MIT     | -     |
| 6   | [poweroutlet2/browser-extension-starter](https://github.com/poweroutlet2/browser-extension-starter)     | React + tRPC          | MIT     | -     |
| 7   | [HugoRCD/wxt-nuxt-ui-starter](https://github.com/HugoRCD/wxt-nuxt-ui-starter)                           | Nuxt UI v3 + Vue      | MIT     | -     |
| 8   | [oneezy/svelte-5-extension](https://github.com/oneezy/svelte-5-extension)                               | Svelte 5 + Runes      | MIT     | -     |
| 9   | [lacolaco/wxt-angular-starter](https://github.com/lacolaco/wxt-angular-starter)                         | Angular integration   | MIT     | -     |
| 10  | [nitzanpap/auto-tab-groups](https://github.com/nitzanpap/auto-tab-groups)                               | Sidebar + rules modal | MIT     | -     |
| 11  | [PerceptivePenguin/GPT-exporter](https://github.com/PerceptivePenguin/GPT-exporter)                     | AI export feature     | MIT     | -     |
| 12  | [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog)                                       | Immersive translation | MIT     | -     |

---

## Sources

1. [wxt-dev/wxt](https://github.com/wxt-dev/wxt) — Framework repository
2. [wxt-dev/examples](https://github.com/wxt-dev/examples) — Official examples
3. [WXT Official Docs](https://wxt.dev) — Framework documentation
4. [DeepWiki: WXT Extension Components](https://deepwiki.com/wxt-dev/wxt/5-extension-components) — Architecture reference
5. [LogRocket Blog: WXT](https://blog.logrocket.com/developing-web-extensions-wxt-library/) — DX patterns
6. [marmelab: Building AI Extensions with WXT](https://marmelab.com/blog/2025/04/15/browser-extension-form-ai-wxt.html) — Case study
7. [GitHub Topics: wxt](https://github.com/topics/wxt) — Community repositories
