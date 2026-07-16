import { useLang } from '@/contexts/LanguageContext'

export default function LanguageToggle() {
  const { language, toggleLanguage } = useLang()

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors min-w-[44px]"
      aria-label="Toggle language"
    >
      {language === 'en' ? 'ع' : 'EN'}
    </button>
  )
}
