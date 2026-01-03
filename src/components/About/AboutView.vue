<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getVersion, getName } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { isAppStoreBuild } from '@/modules/updater/service'
import qrCodeImage from '@/assets/donate/buymeacoffee/buymeacoffee-qr-code.png'
import buttonImage from '@/assets/donate/buymeacoffee/buymeacoffee-button.png'
import appIcon from '@/assets/app-icon.png'

const { t } = useI18n()
const appName = ref('Kano PDF Tool')
const version = ref('')
const isAppStore = ref(false)

onMounted(async () => {
  const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  if (!hasTauri) return

  const [nameResult, versionResult, appStoreResult] = await Promise.allSettled([
    getName(),
    getVersion(),
    isAppStoreBuild(),
  ])

  if (nameResult.status === 'fulfilled' && nameResult.value) {
    appName.value = nameResult.value
  }

  if (versionResult.status === 'fulfilled' && versionResult.value) {
    version.value = versionResult.value
  }

  if (appStoreResult.status === 'fulfilled') {
    isAppStore.value = appStoreResult.value
  }

  if (nameResult.status === 'rejected' || versionResult.status === 'rejected') {
    console.error('[AboutView] failed to load app info', {
      nameError: nameResult.status === 'rejected' ? nameResult.reason : undefined,
      versionError: versionResult.status === 'rejected' ? versionResult.reason : undefined,
    })
  }
})

async function openSponsor() {
  await openLink('https://www.buymeacoffee.com/yuuf.25')
}

async function openHomepage() {
  await openLink('https://github.com/IDK-Silver/PDF_Tool')
}

async function openLink(url: string) {
  try {
    // Prefer native opener when Tauri IPC is available
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      await openUrl(url)
      return
    }
  } catch (err) {
    console.error('[AboutView] openUrl failed, falling back to window.open', err)
  }

  // Browser/dev fallback so the button still works in plain Vite preview
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="h-full w-full overflow-auto bg-[hsl(var(--background))] p-8 md:p-10">
    <div class="w-full max-w-[720px] mx-auto space-y-6 selectable">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div class="flex items-center gap-4">
          <img
            :src="appIcon"
            alt="App Icon"
            class="h-20 w-20 rounded-2xl shadow-md"
          />
          <div>
            <div class="text-2xl font-semibold">{{ appName }}</div>
            <div class="text-sm text-[hsl(var(--muted-foreground))]">{{ t('about.version', { version: version || '...' }) }}</div>
            <div class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ t('about.author') }}</div>
            <div class="text-xs text-[hsl(var(--muted-foreground))]">Email: a288235403@gmail.com</div>
          </div>
        </div>
        <button
          class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-95 transition"
          @click="openHomepage"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
          </svg>
          {{ t('about.homepage') }}
        </button>
      </div>

      <p class="text-[hsl(var(--foreground))] leading-relaxed">
        {{ t('about.description', { appName }) }}
      </p>

      <div class="space-y-4">
        <div class="rounded-lg p-5 bg-[hsl(var(--muted))]">
          <h3 class="font-semibold mb-2">{{ t('about.sponsor') }}</h3>
          <p class="text-sm text-[hsl(var(--muted-foreground))] mb-4">
            {{ t('about.sponsorDescription') }}
          </p>
          <div class="flex flex-row gap-8 items-center justify-center">
            <button
              class="inline-flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0"
              @click="openSponsor"
            >
              <img
                :src="buttonImage"
                alt="Buy me a Mos Burger"
                class="h-[80px] w-auto"
              />
            </button>
            <div class="flex flex-col items-center gap-2 flex-shrink-0">
              <img
                :src="qrCodeImage"
                alt="Buy Me a Coffee QR Code"
                class="w-[100px] h-[100px] rounded-lg border-2 border-[hsl(var(--border))]"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] text-center">{{ t('about.scanQr') }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-lg p-5 bg-[hsl(var(--muted))]">
          <h3 class="font-semibold mb-2">{{ t('about.license') }}</h3>
          <ul class="text-sm text-[hsl(var(--muted-foreground))] space-y-1">
            <li>{{ t('about.licenseType') }}</li>
            <li>{{ t('about.sourceCode') }}</li>
            <li>{{ t('about.feedback') }}</li>
          </ul>
        </div>

        <div v-if="!isAppStore" class="rounded-lg p-5 bg-[hsl(var(--muted))]">
          <h3 class="font-semibold mb-2">{{ t('about.contactUpdate') }}</h3>
          <p class="text-sm text-[hsl(var(--muted-foreground))]">
            {{ t('about.contactDescription', { appName }) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
