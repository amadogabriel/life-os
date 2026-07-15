// Database types for the normalized schema.
// Hand-written to match supabase/migrations/0001_normalized_schema.sql.
// Once you have the Supabase CLI linked to your project, regenerate with:
//   supabase gen types typescript --linked > src/lib/database.types.ts

export interface Database {
  public: {
    Tables: {
      days: {
        Row: { user_id: string; dow: number; name: string; loc: string }
        Insert: { user_id: string; dow: number; name: string; loc?: string }
        Update: { user_id?: string; dow?: number; name?: string; loc?: string }
        Relationships: []
      }
      blocks: {
        Row: {
          id: string
          user_id: string
          dow: number
          position: number
          cat: string
          title: string
          detail: string
          start_min: number
          dur_min: number
          anchored: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          dow: number
          position: number
          cat: string
          title: string
          detail?: string
          start_min?: number
          dur_min: number
          anchored?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          dow?: number
          position?: number
          cat?: string
          title?: string
          detail?: string
          start_min?: number
          dur_min?: number
          anchored?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      block_logs: {
        Row: { user_id: string; block_id: string; done_on: string }
        Insert: { user_id: string; block_id: string; done_on: string }
        Update: { user_id?: string; block_id?: string; done_on?: string }
        Relationships: []
      }
      habits: {
        Row: { id: string; user_id: string; name: string; cat: string; days: number[]; position: number }
        Insert: { id?: string; user_id: string; name: string; cat: string; days?: number[]; position?: number }
        Update: { id?: string; user_id?: string; name?: string; cat?: string; days?: number[]; position?: number }
        Relationships: []
      }
      habit_logs: {
        Row: { user_id: string; habit_id: string; done_on: string }
        Insert: { user_id: string; habit_id: string; done_on: string }
        Update: { user_id?: string; habit_id?: string; done_on?: string }
        Relationships: []
      }
      buckets: {
        Row: { id: string; user_id: string; name: string; cat: string; position: number }
        Insert: { id?: string; user_id: string; name: string; cat: string; position?: number }
        Update: { id?: string; user_id?: string; name?: string; cat?: string; position?: number }
        Relationships: []
      }
      bucket_tasks: {
        Row: { id: string; user_id: string; bucket_id: string; name: string; position: number }
        Insert: { id?: string; user_id: string; bucket_id: string; name: string; position?: number }
        Update: { id?: string; user_id?: string; bucket_id?: string; name?: string; position?: number }
        Relationships: []
      }
      design_items: {
        Row: { id: string; user_id: string; position: number; name: string; cat: string; mins: number }
        Insert: { id?: string; user_id: string; position: number; name: string; cat: string; mins: number }
        Update: { id?: string; user_id?: string; position?: number; name?: string; cat?: string; mins?: number }
        Relationships: []
      }
      profiles: {
        Row: { user_id: string; notes: string; design_wake_min: number }
        Insert: { user_id: string; notes?: string; design_wake_min?: number }
        Update: { user_id?: string; notes?: string; design_wake_min?: number }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
