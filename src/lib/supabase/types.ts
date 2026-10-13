// Gerado a partir do banco (Supabase → generate types). Não editar à mão:
// regenerar depois de cada migração.
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
      audit_logs: {
        Row: {
          acao: string
          created_at: string
          entidade: string
          id: string
          registro_id: string | null
          user_id: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          acao: string
          created_at?: string
          entidade: string
          id?: string
          registro_id?: string | null
          user_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          acao?: string
          created_at?: string
          entidade?: string
          id?: string
          registro_id?: string | null
          user_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          ativo: boolean
          cidade: string | null
          cnpj: string | null
          codigo: string
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          organization_id: string
          razao_social: string | null
          regional: string | null
          responsavel_employee_id: string | null
          responsavel_nome: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          codigo: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
          organization_id: string
          razao_social?: string | null
          regional?: string | null
          responsavel_employee_id?: string | null
          responsavel_nome?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          codigo?: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          organization_id?: string
          razao_social?: string | null
          regional?: string | null
          responsavel_employee_id?: string | null
          responsavel_nome?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_responsavel_employee_id_fkey"
            columns: ["responsavel_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          ativo: boolean
          branch_id: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          branch_id: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          branch_id?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_aso: {
        Row: {
          created_at: string
          data_realizacao: string | null
          data_validade: string | null
          employee_id: string
          id: string
          observacoes: string | null
          storage_path: string | null
          tipo: Database["public"]["Enums"]["aso_type"]
        }
        Insert: {
          created_at?: string
          data_realizacao?: string | null
          data_validade?: string | null
          employee_id: string
          id?: string
          observacoes?: string | null
          storage_path?: string | null
          tipo: Database["public"]["Enums"]["aso_type"]
        }
        Update: {
          created_at?: string
          data_realizacao?: string | null
          data_validade?: string | null
          employee_id?: string
          id?: string
          observacoes?: string | null
          storage_path?: string | null
          tipo?: Database["public"]["Enums"]["aso_type"]
        }
        Relationships: [
          {
            foreignKeyName: "employee_aso_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          ativo: boolean
          categoria: Database["public"]["Enums"]["document_category"]
          created_at: string
          data_documento: string | null
          descricao: string | null
          employee_id: string
          id: string
          nome: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          data_documento?: string | null
          descricao?: string | null
          employee_id: string
          id?: string
          nome: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          data_documento?: string | null
          descricao?: string | null
          employee_id?: string
          id?: string
          nome?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salaries: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          origem: string | null
          salario: number
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          origem?: string | null
          salario: number
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          origem?: string | null
          salario?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_salaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          branch_id: string
          cargo: string | null
          categoria: string | null
          contribui_sindicato: boolean | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_nascimento: string | null
          department_id: string | null
          email: string | null
          horas_mes: number | null
          id: string
          matricula: string | null
          nome: string
          num_dependentes: number | null
          num_filhos: number | null
          observacoes: string | null
          optante_fgts: boolean | null
          status: Database["public"]["Enums"]["employee_status"]
          telefone: string | null
          tipo_contrato: Database["public"]["Enums"]["contract_type"] | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          cargo?: string | null
          categoria?: string | null
          contribui_sindicato?: boolean | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_nascimento?: string | null
          department_id?: string | null
          email?: string | null
          horas_mes?: number | null
          id?: string
          matricula?: string | null
          nome: string
          num_dependentes?: number | null
          num_filhos?: number | null
          observacoes?: string | null
          optante_fgts?: boolean | null
          status?: Database["public"]["Enums"]["employee_status"]
          telefone?: string | null
          tipo_contrato?: Database["public"]["Enums"]["contract_type"] | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          cargo?: string | null
          categoria?: string | null
          contribui_sindicato?: boolean | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_nascimento?: string | null
          department_id?: string | null
          email?: string | null
          horas_mes?: number | null
          id?: string
          matricula?: string | null
          nome?: string
          num_dependentes?: number | null
          num_filhos?: number | null
          observacoes?: string | null
          optante_fgts?: boolean | null
          status?: Database["public"]["Enums"]["employee_status"]
          telefone?: string | null
          tipo_contrato?: Database["public"]["Enums"]["contract_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          ativo: boolean
          cnpj: string | null
          created_at: string
          id: string
          nome_fantasia: string | null
          razao_social: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_fantasia?: string | null
          razao_social: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_fantasia?: string | null
          razao_social?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          adicionais: number
          beneficios: number
          competencia: string
          created_at: string
          descontos: number
          employee_id: string
          horas_extras: number
          id: string
          salario_base: number
          status: Database["public"]["Enums"]["payroll_status"]
          storage_path: string | null
          updated_at: string
          valor_liquido: number
        }
        Insert: {
          adicionais?: number
          beneficios?: number
          competencia: string
          created_at?: string
          descontos?: number
          employee_id: string
          horas_extras?: number
          id?: string
          salario_base?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          storage_path?: string | null
          updated_at?: string
          valor_liquido?: number
        }
        Update: {
          adicionais?: number
          beneficios?: number
          competencia?: string
          created_at?: string
          descontos?: number
          employee_id?: string
          horas_extras?: number
          id?: string
          salario_base?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          storage_path?: string | null
          updated_at?: string
          valor_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          branch_id: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          papel: Database["public"]["Enums"]["app_role"]
          ultimo_acesso: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          branch_id?: string | null
          created_at?: string
          email?: string | null
          id: string
          nome?: string
          papel?: Database["public"]["Enums"]["app_role"]
          ultimo_acesso?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          branch_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["app_role"]
          ultimo_acesso?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          created_at: string
          id: string
          nome: string
          storage_path: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          storage_path: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_id: string | null
          comentario: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          comentario: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          comentario?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_history: {
        Row: {
          acao: string
          author_id: string | null
          created_at: string
          de: string | null
          id: string
          para: string | null
          ticket_id: string
        }
        Insert: {
          acao: string
          author_id?: string | null
          created_at?: string
          de?: string | null
          id?: string
          para?: string | null
          ticket_id: string
        }
        Update: {
          acao?: string
          author_id?: string | null
          created_at?: string
          de?: string | null
          id?: string
          para?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_history_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          branch_id: string | null
          categoria: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          descricao: string | null
          id: string
          numero: number
          prioridade: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          responsavel: string | null
          solicitante: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subcategoria: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          categoria?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          descricao?: string | null
          id?: string
          numero?: number
          prioridade?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          responsavel?: string | null
          solicitante?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategoria?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          categoria?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          descricao?: string | null
          id?: string
          numero?: number
          prioridade?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          responsavel?: string | null
          solicitante?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategoria?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_responsavel_fkey"
            columns: ["responsavel"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_solicitante_fkey"
            columns: ["solicitante"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_access: {
        Row: {
          branch_id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          user_id: string
        }
        Update: {
          branch_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_access_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      branch_employee_counts: {
        Row: {
          branch_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_current_salary: {
        Row: {
          employee_id: string | null
          origem: string | null
          salario: number | null
          vigencia_inicio: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_salaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "rh" | "ti" | "financeiro" | "gerente" | "usuario"
      aso_type:
        | "admissional"
        | "periodico"
        | "retorno"
        | "mudanca_funcao"
        | "demissional"
      contract_type: "clt" | "pj" | "estagio" | "temporario" | "aprendiz"
      document_category:
        | "documento_pessoal"
        | "contrato"
        | "aso"
        | "ferias"
        | "advertencia"
        | "comprovante"
        | "folha"
        | "atestado"
        | "outros"
      employee_status: "ativo" | "afastado" | "ferias" | "desligado"
      payroll_status: "rascunho" | "fechada" | "paga"
      ticket_category:
        | "ti"
        | "rh"
        | "financeiro"
        | "manutencao"
        | "compras"
        | "outros"
      ticket_priority: "baixa" | "normal" | "alta" | "critica"
      ticket_status:
        | "aberto"
        | "em_analise"
        | "em_atendimento"
        | "aguardando_usuario"
        | "aguardando_terceiro"
        | "resolvido"
        | "cancelado"
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
      app_role: ["admin", "rh", "ti", "financeiro", "gerente", "usuario"],
      aso_type: [
        "admissional",
        "periodico",
        "retorno",
        "mudanca_funcao",
        "demissional",
      ],
      contract_type: ["clt", "pj", "estagio", "temporario", "aprendiz"],
      document_category: [
        "documento_pessoal",
        "contrato",
        "aso",
        "ferias",
        "advertencia",
        "comprovante",
        "folha",
        "atestado",
        "outros",
      ],
      employee_status: ["ativo", "afastado", "ferias", "desligado"],
      payroll_status: ["rascunho", "fechada", "paga"],
      ticket_category: [
        "ti",
        "rh",
        "financeiro",
        "manutencao",
        "compras",
        "outros",
      ],
      ticket_priority: ["baixa", "normal", "alta", "critica"],
      ticket_status: [
        "aberto",
        "em_analise",
        "em_atendimento",
        "aguardando_usuario",
        "aguardando_terceiro",
        "resolvido",
        "cancelado",
      ],
    },
  },
} as const
