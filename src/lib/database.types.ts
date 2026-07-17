export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      block_logs: {
        Row: {
          block_id: string
          cat: string
          deep: boolean
          done_on: string
          dur_min: number
          title: string
          user_id: string
        }
        Insert: {
          block_id: string
          cat?: string
          deep?: boolean
          done_on: string
          dur_min?: number
          title?: string
          user_id: string
        }
        Update: {
          block_id?: string
          cat?: string
          deep?: boolean
          done_on?: string
          dur_min?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_logs_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          anchored: boolean
          cat: string
          deep: boolean
          detail: string
          dow: number
          dur_min: number
          habit_id: string | null
          id: string
          position: number
          start_min: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchored?: boolean
          cat: string
          deep?: boolean
          detail?: string
          dow: number
          dur_min: number
          habit_id?: string | null
          id?: string
          position: number
          start_min?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchored?: boolean
          cat?: string
          deep?: boolean
          detail?: string
          dow?: number
          dur_min?: number
          habit_id?: string | null
          id?: string
          position?: number
          start_min?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      bucket_tasks: {
        Row: {
          bucket_id: string
          deep: boolean
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          bucket_id: string
          deep?: boolean
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          bucket_id?: string
          deep?: boolean
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bucket_tasks_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      buckets: {
        Row: {
          cat: string
          color: string
          deep: boolean
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          cat: string
          color?: string
          deep?: boolean
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          cat?: string
          color?: string
          deep?: boolean
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      days: {
        Row: {
          dow: number
          loc: string
          name: string
          user_id: string
        }
        Insert: {
          dow: number
          loc?: string
          name: string
          user_id: string
        }
        Update: {
          dow?: number
          loc?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      design_items: {
        Row: {
          cat: string
          id: string
          mins: number
          name: string
          position: number
          user_id: string
        }
        Insert: {
          cat: string
          id?: string
          mins: number
          name: string
          position: number
          user_id: string
        }
        Update: {
          cat?: string
          id?: string
          mins?: number
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      dump_items: {
        Row: {
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          done_on: string
          habit_id: string
          user_id: string
        }
        Insert: {
          done_on: string
          habit_id: string
          user_id: string
        }
        Update: {
          done_on?: string
          habit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          cat: string
          days: number[]
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          cat: string
          days?: number[]
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          cat?: string
          days?: number[]
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      log_entries: {
        Row: {
          block_id: string | null
          cat: string
          created_at: string
          deep: boolean
          dur_min: number | null
          id: string
          kind: string
          migrated_to: string | null
          on_date: string
          position: number
          project_id: string | null
          signifier: string
          sprint_id: string | null
          state: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          block_id?: string | null
          cat?: string
          created_at?: string
          deep?: boolean
          dur_min?: number | null
          id?: string
          kind?: string
          migrated_to?: string | null
          on_date: string
          position?: number
          project_id?: string | null
          signifier?: string
          sprint_id?: string | null
          state?: string
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          block_id?: string | null
          cat?: string
          created_at?: string
          deep?: boolean
          dur_min?: number | null
          id?: string
          kind?: string
          migrated_to?: string | null
          on_date?: string
          position?: number
          project_id?: string | null
          signifier?: string
          sprint_id?: string | null
          state?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_entries_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entries_migrated_to_fkey"
            columns: ["migrated_to"]
            isOneToOne: false
            referencedRelation: "log_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entries_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      planners: {
        Row: {
          data: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          data?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          data?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          design_wake_min: number
          notes: string
          user_id: string
        }
        Insert: {
          design_wake_min?: number
          notes?: string
          user_id: string
        }
        Update: {
          design_wake_min?: number
          notes?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          goal: string
          id: string
          name: string
          position: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal?: string
          id?: string
          name: string
          position?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          name?: string
          position?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sprints: {
        Row: {
          created_at: string
          end_date: string | null
          goal: string
          id: string
          name: string
          position: number
          project_id: string
          start_date: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          goal?: string
          id?: string
          name: string
          position?: number
          project_id: string
          start_date?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          goal?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
          start_date?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          created_at: string
          done: boolean
          id: string
          position: number
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          text?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      materialize_day: { Args: { d: string; uid: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
