/** Only the independent migration build opts in until full cutover verification. */
export const usesSupabasePersistence = import.meta.env.VITE_PERSISTENCE === 'supabase';
