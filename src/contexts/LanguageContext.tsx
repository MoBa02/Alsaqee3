import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Language } from '@/types'

interface LanguageContextType {
  language: Language
  isRTL: boolean
  toggleLanguage: () => void
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const [language, setLang] = useState<Language>('en')

  const applyLanguage = (lang: Language) => {
    setLang(lang)
    i18n.changeLanguage(lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }

  useEffect(() => {
    const saved = localStorage.getItem('lang') as Language | null
    if (saved) applyLanguage(saved)
  }, [])

  const setLanguage = async (lang: Language) => {
    applyLanguage(lang)
    localStorage.setItem('lang', lang)
    // Persist to profile if logged in
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ language_preference: lang })
        .eq('id', user.id)
    }
  }

  const toggleLanguage = () => setLanguage(language === 'en' ? 'ar' : 'en')

  return (
    <LanguageContext.Provider value={{ language, isRTL: language === 'ar', toggleLanguage, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used within LanguageProvider')
  return ctx
}
