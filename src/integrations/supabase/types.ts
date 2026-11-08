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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      free_reading_claims: {
        Row: {
          consumed_at: string | null
          created_at: string
          device_id: string
          expires_at: string
          fingerprint: string | null
          id: string
          ip_hash: string
          order_id: string | null
          status: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          device_id: string
          expires_at?: string
          fingerprint?: string | null
          id?: string
          ip_hash: string
          order_id?: string | null
          status?: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          device_id?: string
          expires_at?: string
          fingerprint?: string | null
          id?: string
          ip_hash?: string
          order_id?: string | null
          status?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          access_token: string
          asaas_payment_id: string | null
          asaas_qr_id: string | null
          cards: Json
          category: string | null
          client_ip_hash: string | null
          client_stage: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          generation_started_at: string | null
          id: string
          is_free: boolean
          paid_at: string | null
          payment_nudged_at: string | null
          pix_payload: string | null
          pix_qr_image: string | null
          plan: string
          price_cents: number
          question: string
          reading: string | null
          stage_updated_at: string | null
          status: string
        }
        Insert: {
          access_token?: string
          asaas_payment_id?: string | null
          asaas_qr_id?: string | null
          cards: Json
          category?: string | null
          client_ip_hash?: string | null
          client_stage?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          generation_started_at?: string | null
          id?: string
          is_free?: boolean
          paid_at?: string | null
          payment_nudged_at?: string | null
          pix_payload?: string | null
          pix_qr_image?: string | null
          plan: string
          price_cents: number
          question: string
          reading?: string | null
          stage_updated_at?: string | null
          status?: string
        }
        Update: {
          access_token?: string
          asaas_payment_id?: string | null
          asaas_qr_id?: string | null
          cards?: Json
          category?: string | null
          client_ip_hash?: string | null
          client_stage?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          generation_started_at?: string | null
          id?: string
          is_free?: boolean
          paid_at?: string | null
          payment_nudged_at?: string | null
          pix_payload?: string | null
          pix_qr_image?: string | null
          plan?: string
          price_cents?: number
          question?: string
          reading?: string | null
          stage_updated_at?: string | null
          status?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          approved: boolean
          comment: string | null
          created_at: string
          display_name: string | null
          id: string
          order_id: string
          rating: number
        }
        Insert: {
          approved?: boolean
          comment?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          order_id: string
          rating: number
        }
        Update: {
          approved?: boolean
          comment?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          order_id?: string
          rating?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_order_for_generation: {
        Args: { _id: string }
        Returns: {
          access_token: string
          asaas_payment_id: string | null
          asaas_qr_id: string | null
          cards: Json
          category: string | null
          client_ip_hash: string | null
          client_stage: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          generation_started_at: string | null
          id: string
          is_free: boolean
          paid_at: string | null
          payment_nudged_at: string | null
          pix_payload: string | null
          pix_qr_image: string | null
          plan: string
          price_cents: number
          question: string
          reading: string | null
          stage_updated_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reserve_free_reading: {
        Args: {
          _device: string
          _ip: string
          _ip_limit?: number
          _order?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const
