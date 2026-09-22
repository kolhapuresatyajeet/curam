/** Row shapes matching supabase/migrations. Replace with generated types after `supabase gen types`. */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      practices: { Row: { id: string; name: string } };
      staff: { Row: { id: string; practice_id: string; role: string } };
      patients: { Row: { id: string; practice_id: string } };
    };
  };
}
