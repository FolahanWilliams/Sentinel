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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_reflections: {
        Row: {
          bias_type: string
          created_at: string
          id: string
          is_active: boolean
          rule: string
          sample_size: number
          sector: string
          severity: string
          updated_at: string
          user_id: string | null
          win_rate: number
        }
        Insert: {
          bias_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          rule: string
          sample_size?: number
          sector?: string
          severity?: string
          updated_at?: string
          user_id?: string | null
          win_rate: number
        }
        Update: {
          bias_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          rule?: string
          sample_size?: number
          sector?: string
          severity?: string
          updated_at?: string
          user_id?: string | null
          win_rate?: number
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          agent_name: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          estimated_cost_usd: number
          grounded_search_used: boolean
          id: string
          input_tokens: number
          latency_ms: number | null
          output_tokens: number
          provider: string
          success: boolean
          ticker: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          estimated_cost_usd?: number
          grounded_search_used?: boolean
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          output_tokens?: number
          provider: string
          success?: boolean
          ticker?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          estimated_cost_usd?: number
          grounded_search_used?: boolean
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          output_tokens?: number
          provider?: string
          success?: boolean
          ticker?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          user_id: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          user_id?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          user_id?: string | null
          value?: Json
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          id: string
          ticker: string
          messages: Json
          summary: string | null
          user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ticker?: string
          messages?: Json
          summary?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ticker?: string
          messages?: Json
          summary?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          entry_type: string
          id: string
          mood: string | null
          signal_id: string | null
          tags: string[]
          ticker: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          entry_type: string
          id?: string
          mood?: string | null
          signal_id?: string | null
          tags?: string[]
          ticker?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          entry_type?: string
          id?: string
          mood?: string | null
          signal_id?: string | null
          tags?: string[]
          ticker?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      market_events: {
        Row: {
          description: string | null
          detected_at: string
          event_date: string | null
          event_type: string
          headline: string
          id: string
          is_overreaction_candidate: boolean
          price_at_detection: number | null
          price_change_pct: number | null
          raw_data: Json | null
          severity: number
          source_type: string
          source_urls: string[]
          ticker: string
          volume_multiplier: number | null
        }
        Insert: {
          description?: string | null
          detected_at?: string
          event_date?: string | null
          event_type: string
          headline: string
          id?: string
          is_overreaction_candidate?: boolean
          price_at_detection?: number | null
          price_change_pct?: number | null
          raw_data?: Json | null
          severity: number
          source_type?: string
          source_urls?: string[]
          ticker: string
          volume_multiplier?: number | null
        }
        Update: {
          description?: string | null
          detected_at?: string
          event_date?: string | null
          event_type?: string
          headline?: string
          id?: string
          is_overreaction_candidate?: boolean
          price_at_detection?: number | null
          price_change_pct?: number | null
          raw_data?: Json | null
          severity?: number
          source_type?: string
          source_urls?: string[]
          ticker?: string
          volume_multiplier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_events_ticker_fkey"
            columns: ["ticker"]
            isOneToOne: false
            referencedRelation: "watchlist"
            referencedColumns: ["ticker"]
          },
        ]
      }
      portfolio_config: {
        Row: {
          id: string
          kelly_fraction: number
          max_concurrent_positions: number
          max_position_pct: number
          max_sector_exposure_pct: number
          max_total_exposure_pct: number
          risk_per_trade_pct: number
          total_capital: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          kelly_fraction?: number
          max_concurrent_positions?: number
          max_position_pct?: number
          max_sector_exposure_pct?: number
          max_total_exposure_pct?: number
          risk_per_trade_pct?: number
          total_capital?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          kelly_fraction?: number
          max_concurrent_positions?: number
          max_position_pct?: number
          max_sector_exposure_pct?: number
          max_total_exposure_pct?: number
          risk_per_trade_pct?: number
          total_capital?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          currency: string
          entry_price: number | null
          exit_price: number | null
          id: string
          notes: string | null
          opened_at: string | null
          position_pct: number | null
          position_size_usd: number | null
          realized_pnl: number | null
          realized_pnl_pct: number | null
          shares: number | null
          side: string
          signal_id: string | null
          status: string
          ticker: string
          user_id: string | null
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          currency?: string
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          position_pct?: number | null
          position_size_usd?: number | null
          realized_pnl?: number | null
          realized_pnl_pct?: number | null
          shares?: number | null
          side?: string
          signal_id?: string | null
          status?: string
          ticker: string
          user_id?: string | null
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          currency?: string
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          position_pct?: number | null
          position_size_usd?: number | null
          realized_pnl?: number | null
          realized_pnl_pct?: number | null
          shares?: number | null
          side?: string
          signal_id?: string | null
          status?: string
          ticker?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      rss_cache: {
        Row: {
          description: string | null
          expires_at: string
          feed_category: string
          feed_name: string
          fetched_at: string
          id: string
          keywords: string[]
          link: string
          published_at: string | null
          sentiment_reasoning: string | null
          sentiment_score: number | null
          tickers_mentioned: string[]
          title: string
        }
        Insert: {
          description?: string | null
          expires_at: string
          feed_category: string
          feed_name: string
          fetched_at?: string
          id?: string
          keywords?: string[]
          link: string
          published_at?: string | null
          sentiment_reasoning?: string | null
          sentiment_score?: number | null
          tickers_mentioned?: string[]
          title: string
        }
        Update: {
          description?: string | null
          expires_at?: string
          feed_category?: string
          feed_name?: string
          fetched_at?: string
          id?: string
          keywords?: string[]
          link?: string
          published_at?: string | null
          sentiment_reasoning?: string | null
          sentiment_score?: number | null
          tickers_mentioned?: string[]
          title?: string
        }
        Relationships: []
      }
      scan_logs: {
        Row: {
          created_at: string
          duration_ms: number
          error_message: string | null
          estimated_cost_usd: number
          events_detected: number
          id: string
          scan_type: string
          signals_generated: number
          status: string
          tickers_scanned: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error_message?: string | null
          estimated_cost_usd?: number
          events_detected?: number
          id?: string
          scan_type: string
          signals_generated?: number
          status: string
          tickers_scanned?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          estimated_cost_usd?: number
          events_detected?: number
          id?: string
          scan_type?: string
          signals_generated?: number
          status?: string
          tickers_scanned?: number
          user_id?: string | null
        }
        Relationships: []
      }
      sentinel_articles: {
        Row: {
          affected_tickers: Json | null
          category: string
          created_at: string
          entities: string[] | null
          id: string
          impact: string
          link: string
          processed_at: string
          pub_date: string
          sentiment: string
          sentiment_score: number
          signals: Json | null
          source: string
          summary: string | null
          title: string
        }
        Insert: {
          affected_tickers?: Json | null
          category?: string
          created_at?: string
          entities?: string[] | null
          id?: string
          impact?: string
          link: string
          processed_at?: string
          pub_date: string
          sentiment?: string
          sentiment_score?: number
          signals?: Json | null
          source: string
          summary?: string | null
          title: string
        }
        Update: {
          affected_tickers?: Json | null
          category?: string
          created_at?: string
          entities?: string[] | null
          id?: string
          impact?: string
          link?: string
          processed_at?: string
          pub_date?: string
          sentiment?: string
          sentiment_score?: number
          signals?: Json | null
          source?: string
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      sentinel_briefings: {
        Row: {
          briefing_date: string
          generated_at: string
          id: string
          market_mood: string
          signal_count: Json
          top_stories: string[]
          trending_topics: string[]
        }
        Insert: {
          briefing_date?: string
          generated_at?: string
          id?: string
          market_mood?: string
          signal_count?: Json
          top_stories?: string[]
          trending_topics?: string[]
        }
        Update: {
          briefing_date?: string
          generated_at?: string
          id?: string
          market_mood?: string
          signal_count?: Json
          top_stories?: string[]
          trending_topics?: string[]
        }
        Relationships: []
      }
      signal_lessons: {
        Row: {
          category: string
          conviction_score: number | null
          created_at: string | null
          id: string
          lesson_text: string
          lynch_category: string | null
          moat_rating: number | null
          outcome_impact: string | null
          signal_id: string | null
          ticker: string | null
          trade_return_pct: number | null
          user_id: string | null
        }
        Insert: {
          category: string
          conviction_score?: number | null
          created_at?: string | null
          id?: string
          lesson_text: string
          lynch_category?: string | null
          moat_rating?: number | null
          outcome_impact?: string | null
          signal_id?: string | null
          ticker?: string | null
          trade_return_pct?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string
          conviction_score?: number | null
          created_at?: string | null
          id?: string
          lesson_text?: string
          lynch_category?: string | null
          moat_rating?: number | null
          outcome_impact?: string | null
          signal_id?: string | null
          ticker?: string | null
          trade_return_pct?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_lessons_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_outcomes: {
        Row: {
          completed_at: string | null
          entry_price: number
          hit_stop_loss: boolean
          hit_target: boolean
          id: string
          max_drawdown: number | null
          max_gain: number | null
          outcome: string
          price_at_10d: number | null
          price_at_1d: number | null
          price_at_30d: number | null
          price_at_5d: number | null
          return_at_10d: number | null
          return_at_1d: number | null
          return_at_30d: number | null
          return_at_5d: number | null
          signal_id: string
          ticker: string
          tracked_at: string
          user_id: string | null
          user_reported_result: string | null
          user_outcome_notes: string | null
          confirmed_biases: string[] | null
          lessons_learned: string | null
        }
        Insert: {
          completed_at?: string | null
          entry_price: number
          hit_stop_loss?: boolean
          hit_target?: boolean
          id?: string
          max_drawdown?: number | null
          max_gain?: number | null
          outcome?: string
          price_at_10d?: number | null
          price_at_1d?: number | null
          price_at_30d?: number | null
          price_at_5d?: number | null
          return_at_10d?: number | null
          return_at_1d?: number | null
          return_at_30d?: number | null
          return_at_5d?: number | null
          signal_id: string
          ticker: string
          tracked_at?: string
          user_id?: string | null
          user_reported_result?: string | null
          user_outcome_notes?: string | null
          confirmed_biases?: string[] | null
          lessons_learned?: string | null
        }
        Update: {
          completed_at?: string | null
          entry_price?: number
          hit_stop_loss?: boolean
          hit_target?: boolean
          id?: string
          max_drawdown?: number | null
          max_gain?: number | null
          outcome?: string
          price_at_10d?: number | null
          price_at_1d?: number | null
          price_at_30d?: number | null
          price_at_5d?: number | null
          return_at_10d?: number | null
          return_at_1d?: number | null
          return_at_30d?: number | null
          return_at_5d?: number | null
          signal_id?: string
          ticker?: string
          tracked_at?: string
          user_id?: string | null
          user_reported_result?: string | null
          user_outcome_notes?: string | null
          confirmed_biases?: string[] | null
          lessons_learned?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_outcomes_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_ratings: {
        Row: {
          id: string
          rated_at: string
          rating: string
          signal_id: string
          user_id: string | null
        }
        Insert: {
          id?: string
          rated_at?: string
          rating: string
          signal_id: string
          user_id?: string | null
        }
        Update: {
          id?: string
          rated_at?: string
          rating?: string
          signal_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_ratings_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: true
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          agent_outputs: Json | null
          bias_explanation: string | null
          bias_type: string
          calibrated_confidence: number | null
          confidence_score: number
          confluence_level: string | null
          confluence_score: number | null
          conviction_score: number | null
          correction_probability: number | null
          counter_argument: string | null
          created_at: string
          data_quality: string | null
          expected_timeframe_days: number | null
          historical_avg_return: number | null
          historical_matches_count: number | null
          historical_win_rate: number | null
          id: string
          is_paper: boolean
          lynch_category: string | null
          margin_of_safety_pct: number | null
          moat_rating: number | null
          projected_roi: number | null
          projected_win_rate: number | null
          risk_level: string
          secondary_biases: string[]
          signal_type: string
          similar_events_count: number | null
          sources: string[]
          status: string
          stop_loss: number | null
          suggested_entry_high: number | null
          suggested_entry_low: number | null
          ta_alignment: string | null
          ta_snapshot: Json | null
          target_price: number | null
          thesis: string | null
          ticker: string
          trailing_stop_rule: string | null
          updated_at: string
          user_notes: string | null
          user_id: string | null
          why_high_conviction: string | null
          outcome_status: string | null
          outcome_due_at: string | null
          outcome_review_days: number | null
        }
        Insert: {
          agent_outputs?: Json | null
          bias_explanation?: string | null
          bias_type: string
          calibrated_confidence?: number | null
          confidence_score: number
          confluence_level?: string | null
          confluence_score?: number | null
          conviction_score?: number | null
          correction_probability?: number | null
          counter_argument?: string | null
          created_at?: string
          data_quality?: string | null
          expected_timeframe_days?: number | null
          historical_avg_return?: number | null
          historical_matches_count?: number | null
          historical_win_rate?: number | null
          id?: string
          is_paper?: boolean
          lynch_category?: string | null
          margin_of_safety_pct?: number | null
          moat_rating?: number | null
          projected_roi?: number | null
          projected_win_rate?: number | null
          risk_level: string
          secondary_biases?: string[]
          signal_type: string
          similar_events_count?: number | null
          sources?: string[]
          status?: string
          stop_loss?: number | null
          suggested_entry_high?: number | null
          suggested_entry_low?: number | null
          ta_alignment?: string | null
          ta_snapshot?: Json | null
          target_price?: number | null
          thesis?: string | null
          ticker: string
          trailing_stop_rule?: string | null
          updated_at?: string
          user_notes?: string | null
          user_id?: string | null
          why_high_conviction?: string | null
          outcome_status?: string | null
          outcome_due_at?: string | null
          outcome_review_days?: number | null
        }
        Update: {
          agent_outputs?: Json | null
          bias_explanation?: string | null
          bias_type?: string
          calibrated_confidence?: number | null
          confidence_score?: number
          confluence_level?: string | null
          confluence_score?: number | null
          conviction_score?: number | null
          correction_probability?: number | null
          counter_argument?: string | null
          created_at?: string
          data_quality?: string | null
          expected_timeframe_days?: number | null
          historical_avg_return?: number | null
          historical_matches_count?: number | null
          historical_win_rate?: number | null
          id?: string
          is_paper?: boolean
          lynch_category?: string | null
          margin_of_safety_pct?: number | null
          moat_rating?: number | null
          projected_roi?: number | null
          projected_win_rate?: number | null
          risk_level?: string
          secondary_biases?: string[]
          signal_type?: string
          similar_events_count?: number | null
          sources?: string[]
          status?: string
          stop_loss?: number | null
          suggested_entry_high?: number | null
          suggested_entry_low?: number | null
          ta_alignment?: string | null
          ta_snapshot?: Json | null
          target_price?: number | null
          thesis?: string | null
          ticker?: string
          trailing_stop_rule?: string | null
          updated_at?: string
          user_notes?: string | null
          user_id?: string | null
          why_high_conviction?: string | null
          outcome_status?: string | null
          outcome_due_at?: string | null
          outcome_review_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "signals_ticker_fkey"
            columns: ["ticker"]
            isOneToOne: false
            referencedRelation: "watchlist"
            referencedColumns: ["ticker"]
          },
        ]
      }
      watchlist: {
        Row: {
          added_at: string
          company_name: string
          id: string
          is_active: boolean
          notes: string | null
          sector: string
          ticker: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          added_at?: string
          company_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          sector: string
          ticker: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          added_at?: string
          company_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          sector?: string
          ticker?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
