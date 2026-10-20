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
      acesso_solicitacoes: {
        Row: {
          criada_em: string
          id: string
          motivo: string | null
          papel_atual: string
          resposta: string | null
          respondida_em: string | null
          respondida_por: string | null
          respondida_por_nome: string | null
          rota: string
          solicitante: string
          solicitante_nome: string
          status: string
          tela: string
        }
        Insert: {
          criada_em?: string
          id?: string
          motivo?: string | null
          papel_atual: string
          resposta?: string | null
          respondida_em?: string | null
          respondida_por?: string | null
          respondida_por_nome?: string | null
          rota: string
          solicitante: string
          solicitante_nome: string
          status?: string
          tela: string
        }
        Update: {
          criada_em?: string
          id?: string
          motivo?: string | null
          papel_atual?: string
          resposta?: string | null
          respondida_em?: string | null
          respondida_por?: string | null
          respondida_por_nome?: string | null
          rota?: string
          solicitante?: string
          solicitante_nome?: string
          status?: string
          tela?: string
        }
        Relationships: [
          {
            foreignKeyName: "acesso_solicitacoes_respondida_por_fkey"
            columns: ["respondida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acesso_solicitacoes_solicitante_fkey"
            columns: ["solicitante"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      conc_agentes: {
        Row: {
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          revogado_em: string | null
          token_hash: string
          ultimo_uso: string | null
          uploads: number
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          revogado_em?: string | null
          token_hash: string
          ultimo_uso?: string | null
          uploads?: number
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          revogado_em?: string | null
          token_hash?: string
          ultimo_uso?: string | null
          uploads?: number
        }
        Relationships: [
          {
            foreignKeyName: "conc_agentes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conc_aprendizado: {
        Row: {
          atualizado_em: string
          beneficiario: string | null
          bloqueado: boolean
          confirmado: boolean
          fornecedor: string
          id: string
          raiz: string
          taxas: number[]
          vezes: number
        }
        Insert: {
          atualizado_em?: string
          beneficiario?: string | null
          bloqueado?: boolean
          confirmado?: boolean
          fornecedor: string
          id?: string
          raiz: string
          taxas?: number[]
          vezes?: number
        }
        Update: {
          atualizado_em?: string
          beneficiario?: string | null
          bloqueado?: boolean
          confirmado?: boolean
          fornecedor?: string
          id?: string
          raiz?: string
          taxas?: number[]
          vezes?: number
        }
        Relationships: []
      }
      conc_arquivos: {
        Row: {
          arquivado_em: string | null
          arquivado_por: string | null
          enviado_em: string
          enviado_por: string | null
          extensao: string
          filial: number | null
          id: string
          meta: Json
          motivo_arquivo: string | null
          nome: string
          origem: string
          sha256: string
          storage_path: string
          tamanho: number
          tipo: Database["public"]["Enums"]["conc_tipo_arquivo"]
          vezes: number
        }
        Insert: {
          arquivado_em?: string | null
          arquivado_por?: string | null
          enviado_em?: string
          enviado_por?: string | null
          extensao: string
          filial?: number | null
          id?: string
          meta?: Json
          motivo_arquivo?: string | null
          nome: string
          origem?: string
          sha256: string
          storage_path: string
          tamanho: number
          tipo: Database["public"]["Enums"]["conc_tipo_arquivo"]
          vezes?: number
        }
        Update: {
          arquivado_em?: string | null
          arquivado_por?: string | null
          enviado_em?: string
          enviado_por?: string | null
          extensao?: string
          filial?: number | null
          id?: string
          meta?: Json
          motivo_arquivo?: string | null
          nome?: string
          origem?: string
          sha256?: string
          storage_path?: string
          tamanho?: number
          tipo?: Database["public"]["Enums"]["conc_tipo_arquivo"]
          vezes?: number
        }
        Relationships: [
          {
            foreignKeyName: "conc_arquivos_arquivado_por_fkey"
            columns: ["arquivado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_arquivos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conc_conciliacoes: {
        Row: {
          arquivos: string[]
          criado_em: string
          criado_por: string | null
          duracao_ms: number | null
          fil_max: number
          fil_min: number
          id: string
          pct_bateu: number | null
          pct_valor_bateu: number | null
          qtd_dda: number
          qtd_trier: number
          resumo: Json
          titulo: string | null
          total_dda: number
          total_so_dda: number
          total_trier: number
          venc_fim: string | null
          venc_ini: string | null
        }
        Insert: {
          arquivos?: string[]
          criado_em?: string
          criado_por?: string | null
          duracao_ms?: number | null
          fil_max: number
          fil_min: number
          id?: string
          pct_bateu?: number | null
          pct_valor_bateu?: number | null
          qtd_dda?: number
          qtd_trier?: number
          resumo?: Json
          titulo?: string | null
          total_dda?: number
          total_so_dda?: number
          total_trier?: number
          venc_fim?: string | null
          venc_ini?: string | null
        }
        Update: {
          arquivos?: string[]
          criado_em?: string
          criado_por?: string | null
          duracao_ms?: number | null
          fil_max?: number
          fil_min?: number
          id?: string
          pct_bateu?: number | null
          pct_valor_bateu?: number | null
          qtd_dda?: number
          qtd_trier?: number
          resumo?: Json
          titulo?: string | null
          total_dda?: number
          total_so_dda?: number
          total_trier?: number
          venc_fim?: string | null
          venc_ini?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conc_conciliacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conc_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          valor: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conc_config_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conc_depara: {
        Row: {
          alerta: string | null
          ativo: boolean
          created_at: string
          dda: string
          fornecedores: string[]
          id: string
          updated_at: string
        }
        Insert: {
          alerta?: string | null
          ativo?: boolean
          created_at?: string
          dda: string
          fornecedores?: string[]
          id?: string
          updated_at?: string
        }
        Update: {
          alerta?: string | null
          ativo?: boolean
          created_at?: string
          dda?: string
          fornecedores?: string[]
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      conc_enviados_omie: {
        Row: {
          arquivo_id: string | null
          beneficiario: string | null
          chave: string
          conciliacao_id: string | null
          desfeito_em: string | null
          desfeito_por: string | null
          empresa: string | null
          enviado_em: string
          enviado_por: string | null
          filial: number | null
          grupo: string | null
          motivo_desfazer: string | null
          omie_codigo: string | null
          valor: number | null
          vencimento: string | null
          via: string
        }
        Insert: {
          arquivo_id?: string | null
          beneficiario?: string | null
          chave: string
          conciliacao_id?: string | null
          desfeito_em?: string | null
          desfeito_por?: string | null
          empresa?: string | null
          enviado_em?: string
          enviado_por?: string | null
          filial?: number | null
          grupo?: string | null
          motivo_desfazer?: string | null
          omie_codigo?: string | null
          valor?: number | null
          vencimento?: string | null
          via?: string
        }
        Update: {
          arquivo_id?: string | null
          beneficiario?: string | null
          chave?: string
          conciliacao_id?: string | null
          desfeito_em?: string | null
          desfeito_por?: string | null
          empresa?: string | null
          enviado_em?: string
          enviado_por?: string | null
          filial?: number | null
          grupo?: string | null
          motivo_desfazer?: string | null
          omie_codigo?: string | null
          valor?: number | null
          vencimento?: string | null
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "conc_enviados_omie_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "conc_arquivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_enviados_omie_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "conc_conciliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_enviados_omie_desfeito_por_fkey"
            columns: ["desfeito_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_enviados_omie_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conc_itens: {
        Row: {
          alerta: string | null
          barra: string | null
          beneficiario: string | null
          branch_id: string | null
          categoria: string
          chave: string
          cnpj: string | null
          conciliacao_id: string
          dados: Json
          desconto: Json | null
          diferenca: number | null
          documento: string | null
          filial: number | null
          fornecedor: string | null
          fornecedor_real: string | null
          grupo: string
          id: string
          numdoc: string | null
          taxa: number | null
          valor: number
          valor_trier: number | null
          vencimento: string | null
        }
        Insert: {
          alerta?: string | null
          barra?: string | null
          beneficiario?: string | null
          branch_id?: string | null
          categoria: string
          chave: string
          cnpj?: string | null
          conciliacao_id: string
          dados?: Json
          desconto?: Json | null
          diferenca?: number | null
          documento?: string | null
          filial?: number | null
          fornecedor?: string | null
          fornecedor_real?: string | null
          grupo: string
          id?: string
          numdoc?: string | null
          taxa?: number | null
          valor: number
          valor_trier?: number | null
          vencimento?: string | null
        }
        Update: {
          alerta?: string | null
          barra?: string | null
          beneficiario?: string | null
          branch_id?: string | null
          categoria?: string
          chave?: string
          cnpj?: string | null
          conciliacao_id?: string
          dados?: Json
          desconto?: Json | null
          diferenca?: number | null
          documento?: string | null
          filial?: number | null
          fornecedor?: string | null
          fornecedor_real?: string | null
          grupo?: string
          id?: string
          numdoc?: string | null
          taxa?: number | null
          valor?: number
          valor_trier?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conc_itens_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_itens_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "conc_conciliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      conc_pendencias: {
        Row: {
          atribuido_em: string | null
          auto: boolean
          beneficiario: string | null
          branch_id: string | null
          chave: string
          cnpj: string | null
          conciliacao_id: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          detalhe: string | null
          documento: string | null
          filial: number | null
          historico: Json
          motivo: string | null
          problema: string
          regra_id: string | null
          responsavel: string | null
          status: Database["public"]["Enums"]["conc_status_pendencia"]
          valor: number
          vencimento: string | null
          visto_em: string
        }
        Insert: {
          atribuido_em?: string | null
          auto?: boolean
          beneficiario?: string | null
          branch_id?: string | null
          chave: string
          cnpj?: string | null
          conciliacao_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          detalhe?: string | null
          documento?: string | null
          filial?: number | null
          historico?: Json
          motivo?: string | null
          problema: string
          regra_id?: string | null
          responsavel?: string | null
          status?: Database["public"]["Enums"]["conc_status_pendencia"]
          valor?: number
          vencimento?: string | null
          visto_em?: string
        }
        Update: {
          atribuido_em?: string | null
          auto?: boolean
          beneficiario?: string | null
          branch_id?: string | null
          chave?: string
          cnpj?: string | null
          conciliacao_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          detalhe?: string | null
          documento?: string | null
          filial?: number | null
          historico?: Json
          motivo?: string | null
          problema?: string
          regra_id?: string | null
          responsavel?: string | null
          status?: Database["public"]["Enums"]["conc_status_pendencia"]
          valor?: number
          vencimento?: string | null
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "conc_pendencias_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_pendencias_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "conc_conciliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_pendencias_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_pendencias_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "conc_regras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conc_pendencias_responsavel_fkey"
            columns: ["responsavel"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conc_regras: {
        Row: {
          ativo: boolean
          categoria_omie: string | null
          cnpj_raiz: string | null
          created_at: string
          criado_por: string | null
          departamento_omie: string | null
          filiais: number[]
          id: string
          nome: string
          nome_contem: string | null
          ordem: number
          pendencia_acao: Database["public"]["Enums"]["conc_status_pendencia"] | null
          pendencia_motivo: string | null
          problemas: string[]
          ultima_vez: string | null
          updated_at: string
          valor_max: number | null
          valor_min: number | null
          vezes: number
        }
        Insert: {
          ativo?: boolean
          categoria_omie?: string | null
          cnpj_raiz?: string | null
          created_at?: string
          criado_por?: string | null
          departamento_omie?: string | null
          filiais?: number[]
          id?: string
          nome: string
          nome_contem?: string | null
          ordem?: number
          pendencia_acao?: Database["public"]["Enums"]["conc_status_pendencia"] | null
          pendencia_motivo?: string | null
          problemas?: string[]
          ultima_vez?: string | null
          updated_at?: string
          valor_max?: number | null
          valor_min?: number | null
          vezes?: number
        }
        Update: {
          ativo?: boolean
          categoria_omie?: string | null
          cnpj_raiz?: string | null
          created_at?: string
          criado_por?: string | null
          departamento_omie?: string | null
          filiais?: number[]
          id?: string
          nome?: string
          nome_contem?: string | null
          ordem?: number
          pendencia_acao?: Database["public"]["Enums"]["conc_status_pendencia"] | null
          pendencia_motivo?: string | null
          problemas?: string[]
          ultima_vez?: string | null
          updated_at?: string
          valor_max?: number | null
          valor_min?: number | null
          vezes?: number
        }
        Relationships: [
          {
            foreignKeyName: "conc_regras_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      sangria_anexos: {
        Row: {
          criado_em: string
          enviado_por: string | null
          enviado_por_nome: string | null
          id: string
          mime: string | null
          nome: string
          sangria_id: string
          storage_path: string
          tamanho: number | null
        }
        Insert: {
          criado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime?: string | null
          nome: string
          sangria_id: string
          storage_path: string
          tamanho?: number | null
        }
        Update: {
          criado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime?: string | null
          nome?: string
          sangria_id?: string
          storage_path?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sangria_anexos_sangria_id_fkey"
            columns: ["sangria_id"]
            isOneToOne: false
            referencedRelation: "caixa_sangrias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sangria_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_contabil: {
        Row: {
          branch_id: string | null
          competencia: string
          empresa: string
          id: string
          importacao_id: string
          linha: string
          valor: number
        }
        Insert: {
          branch_id?: string | null
          competencia: string
          empresa: string
          id?: string
          importacao_id: string
          linha: string
          valor: number
        }
        Update: {
          branch_id?: string | null
          competencia?: string
          empresa?: string
          id?: string
          importacao_id?: string
          linha?: string
          valor?: number
        }
        Relationships: []
      }
      dre_contabil_importacoes: {
        Row: {
          arquivo: string | null
          avisos: Json | null
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          empresa: string
          filiais: number
          id: string
          meses: string[]
          valores: number
        }
        Insert: {
          arquivo?: string | null
          avisos?: Json | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa: string
          filiais?: number
          id?: string
          meses: string[]
          valores?: number
        }
        Update: {
          arquivo?: string | null
          avisos?: Json | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa?: string
          filiais?: number
          id?: string
          meses?: string[]
          valores?: number
        }
        Relationships: []
      }
      employee_aso: {
        Row: {
          ativo: boolean
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
          ativo?: boolean
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
          ativo?: boolean
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
          data_desligamento: string | null
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
          data_desligamento?: string | null
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
          data_desligamento?: string | null
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
      fin_categorias: {
        Row: {
          ativo: boolean
          created_at: string
          dre_familia: string | null
          dre_grupo: string | null
          dre_sinal: number | null
          fin_familia: string | null
          fin_grupo: string | null
          grupo: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dre_familia?: string | null
          dre_grupo?: string | null
          dre_sinal?: number | null
          fin_familia?: string | null
          fin_grupo?: string | null
          grupo: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dre_familia?: string | null
          dre_grupo?: string | null
          dre_sinal?: number | null
          fin_familia?: string | null
          fin_grupo?: string | null
          grupo?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["fin_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_contas_bancarias: {
        Row: {
          aceita_sangria: boolean
          agencia: string | null
          apelido: string
          ativa: boolean
          atualizado_em: string
          atualizado_por: string | null
          banco: string | null
          conta: string | null
          criado_em: string
          grupo: string | null
          id: string
          observacao: string | null
          tipo: string
        }
        Insert: {
          aceita_sangria?: boolean
          agencia?: string | null
          apelido: string
          ativa?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          banco?: string | null
          conta?: string | null
          criado_em?: string
          grupo?: string | null
          id?: string
          observacao?: string | null
          tipo?: string
        }
        Update: {
          aceita_sangria?: boolean
          agencia?: string | null
          apelido?: string
          ativa?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          banco?: string | null
          conta?: string | null
          criado_em?: string
          grupo?: string | null
          id?: string
          observacao?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_contas_bancarias_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_dre_ajustes: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          branch_id: string | null
          categoria_id: string
          chave: string | null
          competencia: string
          grupo: string
          id: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          categoria_id: string
          chave?: string | null
          competencia: string
          grupo?: string
          id?: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          categoria_id?: string
          chave?: string | null
          competencia?: string
          grupo?: string
          id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_dre_ajustes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_dre_ajustes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_dre_ajustes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_dre_estrutura: {
        Row: {
          familia: string
          grupo: string
          ordem_familia: number
          ordem_grupo: number
          sinal: number
        }
        Insert: {
          familia: string
          grupo: string
          ordem_familia: number
          ordem_grupo: number
          sinal?: number
        }
        Update: {
          familia?: string
          grupo?: string
          ordem_familia?: number
          ordem_grupo?: number
          sinal?: number
        }
        Relationships: []
      }
      fin_dre_saldos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          branch_id: string | null
          campo: string
          chave: string | null
          competencia: string
          grupo: string
          id: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          campo: string
          chave?: string | null
          competencia: string
          grupo?: string
          id?: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          campo?: string
          chave?: string | null
          competencia?: string
          grupo?: string
          id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_dre_saldos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_dre_saldos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fluxo_diario: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          campo: string
          data: string
          grupo: string
          id: string
          texto: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          campo: string
          data: string
          grupo: string
          id?: string
          texto?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          campo?: string
          data?: string
          grupo?: string
          id?: string
          texto?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_diario_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fluxo_mensal: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          competencia: string
          grupo: string
          id: string
          linha: string
          provisao: number | null
          realizado: number | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          competencia: string
          grupo: string
          id?: string
          linha: string
          provisao?: number | null
          realizado?: number | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          competencia?: string
          grupo?: string
          id?: string
          linha?: string
          provisao?: number | null
          realizado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_mensal_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_inadimplencia: {
        Row: {
          ano: number
          atrasado: number | null
          atualizado_em: string
          atualizado_por: string | null
          id: string
          mes: number
          recebido: number | null
          tipo: string
        }
        Insert: {
          ano: number
          atrasado?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
          mes: number
          recebido?: number | null
          tipo: string
        }
        Update: {
          ano?: number
          atrasado?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
          mes?: number
          recebido?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_inadimplencia_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lancamentos: {
        Row: {
          branch_id: string
          categoria_id: string
          competencia: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          id: string
          legado_id: number | null
          lote_id: string | null
          origem: Database["public"]["Enums"]["fin_origem"]
          tipo: Database["public"]["Enums"]["fin_tipo"]
          updated_at: string
          valor: number
        }
        Insert: {
          branch_id: string
          categoria_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          data: string
          descricao?: string | null
          id?: string
          legado_id?: number | null
          lote_id?: string | null
          origem?: Database["public"]["Enums"]["fin_origem"]
          tipo: Database["public"]["Enums"]["fin_tipo"]
          updated_at?: string
          valor: number
        }
        Update: {
          branch_id?: string
          categoria_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          id?: string
          legado_id?: number | null
          lote_id?: string | null
          origem?: Database["public"]["Enums"]["fin_origem"]
          tipo?: Database["public"]["Enums"]["fin_tipo"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_meses_fechados: {
        Row: {
          competencia: string
          fechado_em: string
          fechado_por: string | null
        }
        Insert: {
          competencia: string
          fechado_em?: string
          fechado_por?: string | null
        }
        Update: {
          competencia?: string
          fechado_em?: string
          fechado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_meses_fechados_fechado_por_fkey"
            columns: ["fechado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_orcamentos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          categoria_id: string
          competencia: string
          grupo: string
          id: string
          realizado_informado: number | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          categoria_id: string
          competencia: string
          grupo?: string
          id?: string
          realizado_informado?: number | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          categoria_id?: string
          competencia?: string
          grupo?: string
          id?: string
          realizado_informado?: number | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_orcamentos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_orcamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_empresas_dominio: {
        Row: {
          branch_id: string
          codigo_dominio: number | null
          created_at: string
          razao_social: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id: string
          codigo_dominio?: number | null
          created_at?: string
          razao_social?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string
          codigo_dominio?: number | null
          created_at?: string
          razao_social?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folha_empresas_dominio_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_empresas_dominio_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_eventos: {
        Row: {
          ativo: boolean
          chave: string
          codigo: number | null
          created_at: string
          id: string
          na_planilha: boolean
          nome: string
          ordem: number
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          codigo?: number | null
          created_at?: string
          id?: string
          na_planilha?: boolean
          nome: string
          ordem?: number
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          codigo?: number | null
          created_at?: string
          id?: string
          na_planilha?: boolean
          nome?: string
          ordem?: number
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      folha_lancamentos: {
        Row: {
          branch_id: string
          competencia: string
          created_at: string
          created_by: string | null
          employee_id: string
          evento_id: string
          id: string
          origem: string
          updated_at: string
          updated_by: string | null
          valor: number
        }
        Insert: {
          branch_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          evento_id: string
          id?: string
          origem?: string
          updated_at?: string
          updated_by?: string | null
          valor: number
        }
        Update: {
          branch_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          evento_id?: string
          id?: string
          origem?: string
          updated_at?: string
          updated_by?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "folha_lancamentos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "folha_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_observacoes: {
        Row: {
          competencia: string
          created_at: string
          employee_id: string
          pendente: boolean
          texto: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          competencia: string
          created_at?: string
          employee_id: string
          pendente?: boolean
          texto: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          competencia?: string
          created_at?: string
          employee_id?: string
          pendente?: boolean
          texto?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folha_observacoes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_observacoes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      denuncia_mensagens: {
        Row: {
          autor: string
          criada_em: string
          denuncia_id: string
          id: string
          interna: boolean
          responsavel_id: string | null
          responsavel_nome: string | null
          seq: number
          texto: string
        }
        Insert: {
          autor: string
          criada_em?: string
          denuncia_id: string
          id?: string
          interna?: boolean
          responsavel_id?: string | null
          responsavel_nome?: string | null
          seq?: never
          texto: string
        }
        Update: {
          autor?: string
          criada_em?: string
          denuncia_id?: string
          id?: string
          interna?: boolean
          responsavel_id?: string | null
          responsavel_nome?: string | null
          seq?: never
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "denuncia_mensagens_denuncia_id_fkey"
            columns: ["denuncia_id"]
            isOneToOne: false
            referencedRelation: "denuncias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denuncia_mensagens_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_diagnosticos: {
        Row: {
          criado_em: string
          criado_por: string | null
          dados: Json
          id: string
          resumo: Json
          sistema: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          dados?: Json
          id?: string
          resumo?: Json
          sistema: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          dados?: Json
          id?: string
          resumo?: Json
          sistema?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_diagnosticos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_anexos: {
        Row: {
          criado_em: string
          diferenca_id: string
          enviado_por: string | null
          enviado_por_nome: string | null
          id: string
          mime: string | null
          nome: string
          storage_path: string
          tamanho: number | null
        }
        Insert: {
          criado_em?: string
          diferenca_id: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime?: string | null
          nome: string
          storage_path: string
          tamanho?: number | null
        }
        Update: {
          criado_em?: string
          diferenca_id?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime?: string | null
          nome?: string
          storage_path?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_anexos_diferenca_id_fkey"
            columns: ["diferenca_id"]
            isOneToOne: false
            referencedRelation: "caixa_diferencas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_avisos: {
        Row: {
          dia: string
          email: string
          enviado_em: string
          erro: string | null
          id: string
          nome: string
          origem: string
          profile_id: string | null
          quantidade: number
          valor: number
        }
        Insert: {
          dia: string
          email: string
          enviado_em?: string
          erro?: string | null
          id?: string
          nome: string
          origem: string
          profile_id?: string | null
          quantidade: number
          valor: number
        }
        Update: {
          dia?: string
          email?: string
          enviado_em?: string
          erro?: string | null
          id?: string
          nome?: string
          origem?: string
          profile_id?: string | null
          quantidade?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_avisos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_retirada_conferencias: {
        Row: {
          branch_id: string
          comentario: string | null
          conferido: boolean
          conta_id: string | null
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          deposito_ate: string
          deposito_de: string
          diferenca: number | null
          id: string
          retirada_ate: string
          retirada_de: string
          total_declarado: number
          total_retirada: number
        }
        Insert: {
          branch_id: string
          comentario?: string | null
          conferido?: boolean
          conta_id?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          deposito_ate: string
          deposito_de: string
          id?: string
          retirada_ate: string
          retirada_de: string
          total_declarado: number
          total_retirada: number
        }
        Update: {
          branch_id?: string
          comentario?: string | null
          conferido?: boolean
          conta_id?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          deposito_ate?: string
          deposito_de?: string
          id?: string
          retirada_ate?: string
          retirada_de?: string
          total_declarado?: number
          total_retirada?: number
        }
        Relationships: []
      }
      caixa_sangrias: {
        Row: {
          branch_id: string
          cancelada_em: string | null
          cancelada_por: string | null
          cancelada_por_nome: string | null
          conferencia_obs: string | null
          conferida_em: string | null
          conferida_por: string | null
          conferida_por_nome: string | null
          conta_apelido: string
          conta_id: string
          criada_em: string
          criada_por: string | null
          criada_por_nome: string | null
          data_deposito: string
          data_retirada: string
          id: string
          motivo_cancelamento: string | null
          numero_deposito: string | null
          observacao: string | null
          situacao: string
          valor: number
        }
        Insert: {
          branch_id: string
          cancelada_em?: string | null
          cancelada_por?: string | null
          cancelada_por_nome?: string | null
          conferencia_obs?: string | null
          conferida_em?: string | null
          conferida_por?: string | null
          conferida_por_nome?: string | null
          conta_apelido: string
          conta_id: string
          criada_em?: string
          criada_por?: string | null
          criada_por_nome?: string | null
          data_deposito: string
          data_retirada: string
          id?: string
          motivo_cancelamento?: string | null
          numero_deposito?: string | null
          observacao?: string | null
          situacao?: string
          valor: number
        }
        Update: {
          branch_id?: string
          cancelada_em?: string | null
          cancelada_por?: string | null
          cancelada_por_nome?: string | null
          conferencia_obs?: string | null
          conferida_em?: string | null
          conferida_por?: string | null
          conferida_por_nome?: string | null
          conta_apelido?: string
          conta_id?: string
          criada_em?: string
          criada_por?: string | null
          criada_por_nome?: string | null
          data_deposito?: string
          data_retirada?: string
          id?: string
          motivo_cancelamento?: string | null
          numero_deposito?: string | null
          observacao?: string | null
          situacao?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_sangrias_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_sangrias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_sangrias_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_sangrias_conferida_por_fkey"
            columns: ["conferida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_sangrias_cancelada_por_fkey"
            columns: ["cancelada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_coletas: {
        Row: {
          branch_id: string
          caixas: number
          coletado_em: string
          coletado_por: string | null
          dia: string
          duracao_ms: number | null
          mensagem: string | null
          status: string
        }
        Insert: {
          branch_id: string
          caixas?: number
          coletado_em?: string
          coletado_por?: string | null
          dia: string
          duracao_ms?: number | null
          mensagem?: string | null
          status: string
        }
        Update: {
          branch_id?: string
          caixas?: number
          coletado_em?: string
          coletado_por?: string | null
          dia?: string
          duracao_ms?: number | null
          mensagem?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "caixa_coletas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_coletas_coletado_por_fkey"
            columns: ["coletado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_diferencas: {
        Row: {
          descricao: string | null
          gestor_id: string | null
          lancada_por: string | null
          lancada_por_nome: string | null
          chave_importacao: string | null
          competencia_folha: string | null
          lote_importacao: string | null
          origem: string
          andamento: string
          branch_id: string
          classe: string
          cod_operador: number | null
          coletado_em: string
          competencia: string
          decidida_em: string | null
          decidida_por: string | null
          decidida_por_nome: string | null
          decisao_obs: string | null
          dia: string
          diferenca: number
          employee_id: string | null
          fechamento: string | null
          formas: Json
          id: string
          informado: number
          justificada_em: string | null
          justificada_por: string | null
          justificada_por_nome: string | null
          justificativa: string | null
          nome_operador: string
          numero_caixa: number | null
          valor_quebra: number
        }
        Insert: {
          descricao?: string | null
          gestor_id?: string | null
          lancada_por?: string | null
          lancada_por_nome?: string | null
          chave_importacao?: string | null
          competencia_folha?: string | null
          lote_importacao?: string | null
          origem?: string
          andamento?: string
          branch_id: string
          cod_operador?: number | null
          coletado_em?: string
          decidida_em?: string | null
          decidida_por?: string | null
          decidida_por_nome?: string | null
          decisao_obs?: string | null
          dia: string
          diferenca: number
          employee_id?: string | null
          fechamento?: string | null
          formas?: Json
          id?: string
          informado: number
          justificada_em?: string | null
          justificada_por?: string | null
          justificada_por_nome?: string | null
          justificativa?: string | null
          nome_operador: string
          numero_caixa?: number | null
        }
        Update: {
          descricao?: string | null
          gestor_id?: string | null
          lancada_por?: string | null
          lancada_por_nome?: string | null
          chave_importacao?: string | null
          competencia_folha?: string | null
          lote_importacao?: string | null
          origem?: string
          andamento?: string
          branch_id?: string
          cod_operador?: number | null
          coletado_em?: string
          decidida_em?: string | null
          decidida_por?: string | null
          decidida_por_nome?: string | null
          decisao_obs?: string | null
          dia?: string
          diferenca?: number
          employee_id?: string | null
          fechamento?: string | null
          formas?: Json
          id?: string
          informado?: number
          justificada_em?: string | null
          justificada_por?: string | null
          justificada_por_nome?: string | null
          justificativa?: string | null
          nome_operador?: string
          numero_caixa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_diferencas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_diferencas_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_diferencas_justificada_por_fkey"
            columns: ["justificada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_diferencas_decidida_por_fkey"
            columns: ["decidida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_gestores: {
        Row: {
          branch_id: string
          definido_em: string
          definido_por: string | null
          profile_id: string
        }
        Insert: {
          branch_id: string
          definido_em?: string
          definido_por?: string | null
          profile_id: string
        }
        Update: {
          branch_id?: string
          definido_em?: string
          definido_por?: string | null
          profile_id?: string
        }
        Relationships: []
      }
      caixa_operadores: {
        Row: {
          cod_operador: number
          employee_id: string | null
          nome_trier: string
          vinculado_em: string | null
          vinculado_por: string | null
          visto_em: string
        }
        Insert: {
          cod_operador: number
          employee_id?: string | null
          nome_trier: string
          vinculado_em?: string | null
          vinculado_por?: string | null
          visto_em?: string
        }
        Update: {
          cod_operador?: number
          employee_id?: string | null
          nome_trier?: string
          vinculado_em?: string | null
          vinculado_por?: string | null
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "caixa_operadores_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_operadores_vinculado_por_fkey"
            columns: ["vinculado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      denuncia_responsaveis: {
        Row: {
          liberado_em: string
          liberado_por: string | null
          user_id: string
        }
        Insert: {
          liberado_em?: string
          liberado_por?: string | null
          user_id: string
        }
        Update: {
          liberado_em?: string
          liberado_por?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "denuncia_responsaveis_liberado_por_fkey"
            columns: ["liberado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denuncia_responsaveis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      denuncias: {
        Row: {
          categoria: string
          chave_hash: string
          descricao: string
          envolvidos: string | null
          id: string
          identificacao: string | null
          local_texto: string | null
          protocolo: string
          quando: string | null
          recebida_em: string
          seq: number
          status: string
        }
        Insert: {
          categoria: string
          chave_hash: string
          descricao: string
          envolvidos?: string | null
          id?: string
          identificacao?: string | null
          local_texto?: string | null
          protocolo: string
          quando?: string | null
          recebida_em?: string
          seq?: never
          status?: string
        }
        Update: {
          categoria?: string
          chave_hash?: string
          descricao?: string
          envolvidos?: string | null
          id?: string
          identificacao?: string | null
          local_texto?: string | null
          protocolo?: string
          quando?: string | null
          recebida_em?: string
          seq?: never
          status?: string
        }
        Relationships: []
      }
      it_asset_eventos: {
        Row: {
          asset_id: string
          autor_id: string | null
          autor_nome: string | null
          created_at: string
          data: string
          descricao: string
          id: string
          tipo: string
        }
        Insert: {
          asset_id: string
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          data?: string
          descricao: string
          id?: string
          tipo: string
        }
        Update: {
          asset_id?: string
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      it_assets: {
        Row: {
          anydesk: string | null
          garantia_ate: string | null
          hostname: string | null
          ip: string | null
          setor: string | null
          ativo: boolean
          branch_id: string
          created_at: string
          data_aquisicao: string | null
          descricao: string
          fornecedor: string | null
          id: string
          numero_serie: string | null
          observacoes: string | null
          patrimonio: string | null
          responsavel_employee_id: string | null
          status: Database["public"]["Enums"]["it_asset_status"]
          tipo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          anydesk?: string | null
          garantia_ate?: string | null
          hostname?: string | null
          ip?: string | null
          setor?: string | null
          ativo?: boolean
          branch_id: string
          created_at?: string
          data_aquisicao?: string | null
          descricao: string
          fornecedor?: string | null
          id?: string
          numero_serie?: string | null
          observacoes?: string | null
          patrimonio?: string | null
          responsavel_employee_id?: string | null
          status?: Database["public"]["Enums"]["it_asset_status"]
          tipo: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          anydesk?: string | null
          garantia_ate?: string | null
          hostname?: string | null
          ip?: string | null
          setor?: string | null
          ativo?: boolean
          branch_id?: string
          created_at?: string
          data_aquisicao?: string | null
          descricao?: string
          fornecedor?: string | null
          id?: string
          numero_serie?: string | null
          observacoes?: string | null
          patrimonio?: string | null
          responsavel_employee_id?: string | null
          status?: Database["public"]["Enums"]["it_asset_status"]
          tipo?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "it_assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "it_assets_responsavel_employee_id_fkey"
            columns: ["responsavel_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          fechada_em: string | null
          fgts: number
          horas_extras: number
          id: string
          inss: number
          irrf: number
          observacoes: string | null
          outros_descontos: number
          paga_em: string | null
          qtd_horas_extras_100: number
          qtd_horas_extras_50: number
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
          fechada_em?: string | null
          fgts?: number
          horas_extras?: number
          id?: string
          inss?: number
          irrf?: number
          observacoes?: string | null
          outros_descontos?: number
          paga_em?: string | null
          qtd_horas_extras_100?: number
          qtd_horas_extras_50?: number
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
          fechada_em?: string | null
          fgts?: number
          horas_extras?: number
          id?: string
          inss?: number
          irrf?: number
          observacoes?: string | null
          outros_descontos?: number
          paga_em?: string | null
          qtd_horas_extras_100?: number
          qtd_horas_extras_50?: number
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
      rh_desligamento_checklist: {
        Row: {
          employee_id: string
          feito_em: string
          feito_por: string | null
          feito_por_nome: string | null
          item: string
        }
        Insert: {
          employee_id: string
          feito_em?: string
          feito_por?: string | null
          feito_por_nome?: string | null
          item: string
        }
        Update: {
          employee_id?: string
          feito_em?: string
          feito_por?: string | null
          feito_por_nome?: string | null
          item?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_sistema: boolean
          ativo: boolean
          branch_id: string | null
          created_at: string
          email: string | null
          employee_id: string | null
          id: string
          nome: string
          papel: Database["public"]["Enums"]["app_role"]
          regional: string | null
          ultimo_acesso: string | null
          updated_at: string
        }
        Insert: {
          admin_sistema?: boolean
          ativo?: boolean
          branch_id?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id: string
          nome?: string
          papel?: Database["public"]["Enums"]["app_role"]
          regional?: string | null
          ultimo_acesso?: string | null
          updated_at?: string
        }
        Update: {
          admin_sistema?: boolean
          ativo?: boolean
          branch_id?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["app_role"]
          regional?: string | null
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
      sistema_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          valor: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sistema_config_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          primeira_resposta_em: string | null
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
          primeira_resposta_em?: string | null
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
          primeira_resposta_em?: string | null
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
      caixa_operadores_resumo: {
        Row: {
          caixas: number | null
          cod_operador: number | null
          employee_id: string | null
          filiais: string[] | null
          nome_trier: string | null
          quebras: number | null
          quebras_sem_funcionario: number | null
          ultimo_dia: string | null
          vinculado_em: string | null
          visto_em: string | null
        }
        Relationships: []
      }
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
      conc_boletos_vistos: {
        Row: {
          anomalias: Json | null
          banco: string | null
          beneficiario: string | null
          categoria: string | null
          chave: string | null
          cnpj_num: string | null
          conciliacao_id: string | null
          criado_em: string | null
          filial: number | null
          fora_padrao: boolean | null
          fornecedor: string | null
          fornecedor_real: string | null
          grupo: string | null
          raiz: string | null
          valor: number | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conc_itens_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "conc_conciliacoes"
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
      fin_lotes: {
        Row: {
          ate: string | null
          created_by: string | null
          criado_em: string | null
          de: string | null
          descricao: string | null
          lote_id: string | null
          origem: Database["public"]["Enums"]["fin_origem"] | null
          qtd: number | null
          total: number | null
          unidades: number | null
        }
        Relationships: []
      }
      fin_resumo_categoria: {
        Row: {
          branch_id: string | null
          categoria_id: string | null
          competencia: string | null
          qtd: number | null
          tipo: Database["public"]["Enums"]["fin_tipo"] | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_resumo_mensal: {
        Row: {
          branch_id: string | null
          competencia: string | null
          qtd: number | null
          tipo: Database["public"]["Enums"]["fin_tipo"] | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      conc_fornecedor_ficha: {
        Args: { p_raiz: string }
        Returns: {
          bancos: string[]
          boletos: number
          cnpjs: string[]
          divergencias: number
          exatos: number
          fora_padrao: number
          fornecedores: string[]
          maximo: number
          mediana: number
          minimo: number
          nome: string
          p10: number
          p90: number
          primeiro: string
          raiz: string
          total: number
          ultimo: string
          ultimo_venc: string
        }[]
      }
      conc_regras_registrar_uso: {
        Args: { p_ids: string[]; p_qtds: number[] }
        Returns: undefined
      }
      conc_fornecedor_historico: {
        Args: { p_raizes: string[] }
        Returns: {
          bancos: string[]
          cnpjs: string[]
          n: number
          raiz: string
          valores: Json
        }[]
      }
      busca_global: {
        Args: { p_limite?: number; p_q: string }
        Returns: {
          data: string | null
          detalhe: string | null
          extra: string | null
          id: string
          situacao: string | null
          tipo: string
          titulo: string
          valor: number | null
        }[]
      }
      conc_fornecedores_lista: {
        Args: { p_limite?: number; p_q?: string }
        Returns: {
          bancos: number
          cnpjs: number
          divergencias: number
          exatos: number
          fora_padrao: number
          nome: string
          primeiro: string
          qtd: number
          raiz: string
          total: number
          ultimo: string
          ultimo_venc: string
        }[]
      }
      fin_diario: {
        Args: { p_ate: string; p_branches?: string[]; p_de: string }
        Returns: {
          categoria_id: string
          data: string
          qtd: number
          tipo: Database["public"]["Enums"]["fin_tipo"]
          total: number
        }[]
      }
      fin_dre: {
        Args: { p_ate: string; p_branches?: string[]; p_de: string }
        Returns: {
          categoria_id: string
          competencia: string
          qtd: number
          tipo: Database["public"]["Enums"]["fin_tipo"]
          total: number
        }[]
      }
      fin_resumo_unidades: {
        Args: { p_ate: string; p_branches?: string[]; p_de: string }
        Returns: {
          branch_id: string
          competencia: string
          grupo: string
          tipo: Database["public"]["Enums"]["fin_tipo"]
          total: number
        }[]
      }
      fin_totais: {
        Args: {
          p_ate?: string
          p_branches?: string[]
          p_categoria?: string
          p_de?: string
          p_origem?: Database["public"]["Enums"]["fin_origem"]
          p_q?: string
          p_tipo?: Database["public"]["Enums"]["fin_tipo"]
        }
        Returns: {
          qtd: number
          tipo: Database["public"]["Enums"]["fin_tipo"]
          total: number
        }[]
      }
      caixa_folha_travada: {
        Args: { p_competencia: string; p_employees: string[] }
        Returns: {
          employee_id: string
          origem: string
        }[]
      }
      caixa_funcionarios: {
        Args: never
        Returns: {
          branch_id: string
          cargo: string | null
          filial: string
          id: string
          matricula: string | null
          nome: string
          status: string
        }[]
      }
      caixa_justificar: {
        Args: { p_id: string; p_texto: string }
        Returns: undefined
      }
      caixa_usuarios: {
        Args: never
        Returns: {
          branch_id: string | null
          filial: string | null
          id: string
          nome: string
          papel: string
        }[]
      }
      rh_historico_funcionario: {
        Args: { p_employee: string }
        Returns: {
          acao: string
          autor: string
          criado_em: string
          entidade: string
          valor_anterior: Json
          valor_novo: Json
        }[]
      }
      dre_contabil_importar: {
        Args: { p_arquivo: string; p_avisos?: Json; p_empresa: string; p_meses: string[]; p_valores: Json }
        Returns: string
      }
      contas_para_deposito: {
        Args: never
        Returns: {
          apelido: string
          banco: string
          id: string
          tipo: string
        }[]
      }
      lojas_para_sangria: {
        Args: never
        Returns: {
          codigo: string
          id: string
          nome: string
        }[]
      }
      integracao_ler_segredos: {
        Args: { p_nomes: string[] }
        Returns: {
          nome: string
          valor: string
        }[]
      }
      integracao_ler_segredos_servico: {
        Args: { p_nomes: string[] }
        Returns: {
          nome: string
          valor: string
        }[]
      }
      integracao_salvar_segredo: {
        Args: { p_nome: string; p_valor: string }
        Returns: undefined
      }
      integracao_status_segredos: {
        Args: never
        Returns: {
          atualizado_em: string
          final: string
          nome: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "rh"
        | "ti"
        | "financeiro"
        | "gerente"
        | "usuario"
        | "contador"
        | "coordenador"
        | "manutencao"
        | "compras"
        | "marketing"
      aso_type:
        | "admissional"
        | "periodico"
        | "retorno"
        | "mudanca_funcao"
        | "demissional"
      conc_status_pendencia:
        | "pendente"
        | "em_analise"
        | "resolvido"
        | "justificado"
      conc_tipo_arquivo: "dda_ret" | "dda_planilha" | "trier" | "omie"
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
      fin_origem: "manual" | "omie" | "migracao"
      fin_tipo: "receber" | "pagar"
      it_asset_status: "em_uso" | "estoque" | "manutencao" | "baixado"
      payroll_status: "rascunho" | "fechada" | "paga"
      ticket_category:
        | "ti"
        | "rh"
        | "financeiro"
        | "manutencao"
        | "compras"
        | "outros"
        | "marketing"
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
      app_role: [
        "admin",
        "rh",
        "ti",
        "financeiro",
        "gerente",
        "usuario",
        "contador",
        "coordenador",
        "manutencao",
        "compras",
        "marketing",
      ],
      aso_type: [
        "admissional",
        "periodico",
        "retorno",
        "mudanca_funcao",
        "demissional",
      ],
      conc_status_pendencia: [
        "pendente",
        "em_analise",
        "resolvido",
        "justificado",
      ],
      conc_tipo_arquivo: ["dda_ret", "dda_planilha", "trier", "omie"],
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
      fin_origem: ["manual", "omie", "migracao"],
      fin_tipo: ["receber", "pagar"],
      it_asset_status: ["em_uso", "estoque", "manutencao", "baixado"],
      payroll_status: ["rascunho", "fechada", "paga"],
      ticket_category: [
        "ti",
        "rh",
        "financeiro",
        "manutencao",
        "compras",
        "outros",
        "marketing",
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
