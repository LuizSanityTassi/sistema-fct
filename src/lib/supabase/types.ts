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
      acesso_telas: {
        Row: {
          concedido_por: string | null
          criado_em: string
          pode_editar: boolean
          rota: string
          user_id: string
        }
        Insert: {
          concedido_por?: string | null
          criado_em?: string
          pode_editar?: boolean
          rota: string
          user_id: string
        }
        Update: {
          concedido_por?: string | null
          criado_em?: string
          pode_editar?: boolean
          rota?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acesso_telas_concedido_por_fkey"
            columns: ["concedido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acesso_telas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aud_checklists: {
        Row: {
          aberto_em: string
          anotacoes: string | null
          auditor_id: string | null
          auditor_nome: string | null
          branch_id: string
          cancelado_em: string | null
          cancelado_por: string | null
          criado_em: string
          finalizado_em: string
          gerente_nome: string | null
          id: string
          motivo_cancelamento: string | null
          numero: number
          observacao: string | null
          respostas: Json
          situacao: string
        }
        Insert: {
          aberto_em: string
          anotacoes?: string | null
          auditor_id?: string | null
          auditor_nome?: string | null
          branch_id: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          criado_em?: string
          finalizado_em?: string
          gerente_nome?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          observacao?: string | null
          respostas: Json
          situacao?: string
        }
        Update: {
          aberto_em?: string
          anotacoes?: string | null
          auditor_id?: string | null
          auditor_nome?: string | null
          branch_id?: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          criado_em?: string
          finalizado_em?: string
          gerente_nome?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          observacao?: string | null
          respostas?: Json
          situacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "aud_checklists_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aud_checklists_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aud_checklists_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aud_precificacao_itens: {
        Row: {
          codigo: string
          criado_em: string
          da_base: boolean
          diferenca: number | null
          id: string
          precificacao_id: string
          produto: string
          sistema_confirmado: boolean
          valor_etiqueta: number
          valor_sistema: number
        }
        Insert: {
          codigo: string
          criado_em?: string
          da_base?: boolean
          diferenca?: number | null
          id?: string
          precificacao_id: string
          produto: string
          sistema_confirmado?: boolean
          valor_etiqueta: number
          valor_sistema: number
        }
        Update: {
          codigo?: string
          criado_em?: string
          da_base?: boolean
          diferenca?: number | null
          id?: string
          precificacao_id?: string
          produto?: string
          sistema_confirmado?: boolean
          valor_etiqueta?: number
          valor_sistema?: number
        }
        Relationships: [
          {
            foreignKeyName: "aud_precificacao_itens_precificacao_id_fkey"
            columns: ["precificacao_id"]
            isOneToOne: false
            referencedRelation: "aud_precificacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      aud_precificacoes: {
        Row: {
          aberto_em: string
          auditor_id: string | null
          auditor_nome: string | null
          branch_id: string
          cancelado_em: string | null
          cancelado_por: string | null
          finalizado_em: string | null
          id: string
          motivo_cancelamento: string | null
          numero: number
          observacao: string | null
          qtd_divergente: number | null
          qtd_verificada: number | null
          situacao: string
        }
        Insert: {
          aberto_em?: string
          auditor_id?: string | null
          auditor_nome?: string | null
          branch_id: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          finalizado_em?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          observacao?: string | null
          qtd_divergente?: number | null
          qtd_verificada?: number | null
          situacao?: string
        }
        Update: {
          aberto_em?: string
          auditor_id?: string | null
          auditor_nome?: string | null
          branch_id?: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          finalizado_em?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          observacao?: string | null
          qtd_divergente?: number | null
          qtd_verificada?: number | null
          situacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "aud_precificacoes_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aud_precificacoes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aud_precificacoes_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aud_precos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          codigo: string
          descricao: string
          ean: string | null
          preco: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          codigo: string
          descricao: string
          ean?: string | null
          preco: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          codigo?: string
          descricao?: string
          ean?: string | null
          preco?: number
        }
        Relationships: [
          {
            foreignKeyName: "aud_precos_atualizado_por_fkey"
            columns: ["atualizado_por"]
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
      avisos: {
        Row: {
          created_at: string
          detalhe: string | null
          href: string | null
          id: string
          lida_em: string | null
          severidade: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detalhe?: string | null
          href?: string | null
          id?: string
          lida_em?: string | null
          severidade?: string
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          detalhe?: string | null
          href?: string | null
          id?: string
          lida_em?: string | null
          severidade?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_user_id_fkey"
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
          ponto_qualquer_filial: boolean
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
          ponto_qualquer_filial?: boolean
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
          ponto_qualquer_filial?: boolean
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
          barra: string | null
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
          barra?: string | null
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
          barra?: string | null
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
          enviado_em: string | null
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
          enviado_em?: string | null
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
          enviado_em?: string | null
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
      fin_fluxo_classes: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          categoria: string
          grupo: string
          lugar: string
          ordem: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          categoria?: string
          grupo?: string
          lugar: string
          ordem?: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          categoria?: string
          grupo?: string
          lugar?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_classes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fluxo_motivos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          data: string
          empresa: string
          texto: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          data: string
          empresa: string
          texto: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          data?: string
          empresa?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_motivos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fluxo_notas: {
        Row: {
          autor: string
          criado_em: string
          empresa: string | null
          id: string
          importante: boolean
          referencia: string | null
          resolvida_em: string | null
          resolvida_por: string | null
          texto: string
        }
        Insert: {
          autor?: string
          criado_em?: string
          empresa?: string | null
          id?: string
          importante?: boolean
          referencia?: string | null
          resolvida_em?: string | null
          resolvida_por?: string | null
          texto: string
        }
        Update: {
          autor?: string
          criado_em?: string
          empresa?: string | null
          id?: string
          importante?: boolean
          referencia?: string | null
          resolvida_em?: string | null
          resolvida_por?: string | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_notas_autor_fkey"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_fluxo_notas_resolvida_por_fkey"
            columns: ["resolvida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fluxo_pagar: {
        Row: {
          categoria: string
          data: string
          empresa: string
          grupo: string
          id: number
          importacao_id: string
          valor: number
        }
        Insert: {
          categoria?: string
          data: string
          empresa: string
          grupo?: string
          id?: never
          importacao_id: string
          valor: number
        }
        Update: {
          categoria?: string
          data?: string
          empresa?: string
          grupo?: string
          id?: never
          importacao_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_pagar_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "fin_fluxo_pagar_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fluxo_pagar_importacoes: {
        Row: {
          arquivo: string
          ate: string
          criado_em: string
          criado_por: string | null
          de: string
          empresa: string
          gerado: string | null
          id: string
          linhas: number
          total: number
        }
        Insert: {
          arquivo: string
          ate: string
          criado_em?: string
          criado_por?: string | null
          de: string
          empresa: string
          gerado?: string | null
          id?: string
          linhas: number
          total: number
        }
        Update: {
          arquivo?: string
          ate?: string
          criado_em?: string
          criado_por?: string | null
          de?: string
          empresa?: string
          gerado?: string | null
          id?: string
          linhas?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_pagar_importacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fluxo_previsoes: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          campo: string
          data: string
          empresa: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          campo: string
          data: string
          empresa: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          campo?: string
          data?: string
          empresa?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_fluxo_previsoes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_agentes: {
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
            foreignKeyName: "gi_conc_agentes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_aprendizado: {
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
      gi_conc_arquivos: {
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
            foreignKeyName: "gi_conc_arquivos_arquivado_por_fkey"
            columns: ["arquivado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_conc_arquivos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_conciliacoes: {
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
            foreignKeyName: "gi_conc_conciliacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_config: {
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
            foreignKeyName: "gi_conc_config_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_depara: {
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
      gi_conc_enviados_omie: {
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
            foreignKeyName: "gi_conc_enviados_omie_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "gi_conc_arquivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_conc_enviados_omie_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "gi_conc_conciliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_conc_enviados_omie_desfeito_por_fkey"
            columns: ["desfeito_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_conc_enviados_omie_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_itens: {
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
            foreignKeyName: "gi_conc_itens_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "gi_conc_conciliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_pendencias: {
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
            foreignKeyName: "gi_conc_pendencias_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "gi_conc_conciliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_conc_pendencias_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_conc_pendencias_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "gi_conc_regras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_conc_pendencias_responsavel_fkey"
            columns: ["responsavel"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_regras: {
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
            foreignKeyName: "gi_conc_regras_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_conc_filiais: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          cnpj: string | null
          codigo: number
          departamento_omie: string | null
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          codigo: number
          departamento_omie?: string | null
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          codigo?: number
          departamento_omie?: string | null
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "gi_conc_filiais_atualizado_por_fkey"
            columns: ["atualizado_por"]
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
      ponto_ajustes: {
        Row: {
          acao: string
          branch_id: string
          data: string
          decidido_em: string | null
          decidido_por: string | null
          employee_id: string
          horario_original: string | null
          horario_solicitado: string | null
          id: string
          marcacao_id: string | null
          motivo: string
          motivo_tipo: string
          resposta: string | null
          solicitado_em: string
          solicitado_por: string | null
          status: string
          tipo_marcacao: string | null
        }
        Insert: {
          acao: string
          branch_id: string
          data: string
          decidido_em?: string | null
          decidido_por?: string | null
          employee_id: string
          horario_original?: string | null
          horario_solicitado?: string | null
          id?: string
          marcacao_id?: string | null
          motivo: string
          motivo_tipo: string
          resposta?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tipo_marcacao?: string | null
        }
        Update: {
          acao?: string
          branch_id?: string
          data?: string
          decidido_em?: string | null
          decidido_por?: string | null
          employee_id?: string
          horario_original?: string | null
          horario_solicitado?: string | null
          id?: string
          marcacao_id?: string | null
          motivo?: string
          motivo_tipo?: string
          resposta?: string | null
          solicitado_em?: string
          solicitado_por?: string | null
          status?: string
          tipo_marcacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ponto_ajustes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_ajustes_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_ajustes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_ajustes_marcacao_id_fkey"
            columns: ["marcacao_id"]
            isOneToOne: false
            referencedRelation: "ponto_marcacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_ajustes_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_ausencias: {
        Row: {
          employee_id: string
          fim: string
          id: string
          inicio: string
          observacao: string | null
          registrado_em: string
          registrado_por: string | null
          tipo: string
        }
        Insert: {
          employee_id: string
          fim: string
          id?: string
          inicio: string
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          tipo: string
        }
        Update: {
          employee_id?: string
          fim?: string
          id?: string
          inicio?: string
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_ausencias_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_ausencias_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_extras_liberadas: {
        Row: { id: string; employee_id: string; dia: string; ticket_id: string; liberado_por: string | null; liberado_em: string; cancelado_em: string | null; cancelado_por: string | null }
        Insert: { id?: string; employee_id: string; dia: string; ticket_id: string; liberado_por?: string | null; liberado_em?: string; cancelado_em?: string | null; cancelado_por?: string | null }
        Update: { id?: string; employee_id?: string; dia?: string; ticket_id?: string; liberado_por?: string | null; liberado_em?: string; cancelado_em?: string | null; cancelado_por?: string | null }
        Relationships: []
      }
      ponto_banco_movimentos: {
        Row: {
          data: string
          descricao: string | null
          employee_id: string
          fechamento_id: string | null
          id: string
          minutos: number
          registrado_em: string
          registrado_por: string | null
          tipo: string
        }
        Insert: {
          data: string
          descricao?: string | null
          employee_id: string
          fechamento_id?: string | null
          id?: string
          minutos: number
          registrado_em?: string
          registrado_por?: string | null
          tipo: string
        }
        Update: {
          data?: string
          descricao?: string | null
          employee_id?: string
          fechamento_id?: string | null
          id?: string
          minutos?: number
          registrado_em?: string
          registrado_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_banco_movimentos_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_banco_movimentos_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "ponto_fechamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_banco_movimentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_config_filial: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          branch_id: string
          exige_localizacao: boolean
          inicio_controle: string
          jornada_padrao_id: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id: string
          exige_localizacao?: boolean
          inicio_controle?: string
          jornada_padrao_id?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string
          exige_localizacao?: boolean
          inicio_controle?: string
          jornada_padrao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ponto_config_filial_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_config_filial_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_config_filial_jornada_padrao_id_fkey"
            columns: ["jornada_padrao_id"]
            isOneToOne: false
            referencedRelation: "ponto_jornadas"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_fechamentos: {
        Row: {
          branch_id: string
          competencia: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          motivo_reabertura: string | null
          reaberto_em: string | null
          reaberto_por: string | null
          resumo: Json | null
          status: string
        }
        Insert: {
          branch_id: string
          competencia: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          resumo?: Json | null
          status: string
        }
        Update: {
          branch_id?: string
          competencia?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          resumo?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_fechamentos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_fechamentos_fechado_por_fkey"
            columns: ["fechado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_fechamentos_reaberto_por_fkey"
            columns: ["reaberto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_feriados: {
        Row: {
          abrangencia: string
          branch_id: string | null
          created_at: string
          created_by: string | null
          data: string
          id: string
          nome: string
        }
        Insert: {
          abrangencia?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          nome: string
        }
        Update: {
          abrangencia?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_feriados_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_feriados_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_jornada_dias: {
        Row: {
          entrada: string | null
          folga: boolean
          intervalo_fim: string | null
          intervalo_inicio: string | null
          jornada_id: string
          posicao: number
          saida: string | null
        }
        Insert: {
          entrada?: string | null
          folga?: boolean
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          jornada_id: string
          posicao: number
          saida?: string | null
        }
        Update: {
          entrada?: string | null
          folga?: boolean
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          jornada_id?: string
          posicao?: number
          saida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ponto_jornada_dias_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "ponto_jornadas"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_jornadas: {
        Row: {
          ativo: boolean
          branch_id: string | null
          ciclo_dias: number | null
          created_at: string
          created_by: string | null
          data_base: string | null
          descricao: string | null
          id: string
          nome: string
          tipo: string
          tolerancia_min: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          branch_id?: string | null
          ciclo_dias?: number | null
          created_at?: string
          created_by?: string | null
          data_base?: string | null
          descricao?: string | null
          id?: string
          nome: string
          tipo: string
          tolerancia_min?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          branch_id?: string | null
          ciclo_dias?: number | null
          created_at?: string
          created_by?: string | null
          data_base?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          tipo?: string
          tolerancia_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_jornadas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_jornadas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_marcacoes: {
        Row: {
          ajuste_id: string | null
          anulada: boolean
          anulada_em: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          branch_id: string
          created_at: string
          dispositivo: string | null
          employee_id: string
          id: string
          ip: string | null
          latitude: number | null
          longitude: number | null
          metodo: string
          momento: string
          nsr: number
          origem: string
          precisao_m: number | null
          registrado_por: string | null
          relogio_branch_id: string | null
          tipo: string
        }
        Insert: {
          ajuste_id?: string | null
          anulada?: boolean
          anulada_em?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          branch_id: string
          created_at?: string
          dispositivo?: string | null
          employee_id: string
          id?: string
          ip?: string | null
          latitude?: number | null
          longitude?: number | null
          metodo: string
          momento: string
          nsr?: never
          origem?: string
          precisao_m?: number | null
          registrado_por?: string | null
          relogio_branch_id?: string | null
          tipo: string
        }
        Update: {
          ajuste_id?: string | null
          anulada?: boolean
          anulada_em?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          branch_id?: string
          created_at?: string
          dispositivo?: string | null
          employee_id?: string
          id?: string
          ip?: string | null
          latitude?: number | null
          longitude?: number | null
          metodo?: string
          momento?: string
          nsr?: never
          origem?: string
          precisao_m?: number | null
          registrado_por?: string | null
          relogio_branch_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_marcacoes_ajuste_fk"
            columns: ["ajuste_id"]
            isOneToOne: false
            referencedRelation: "ponto_ajustes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_marcacoes_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_marcacoes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_marcacoes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_marcacoes_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_pins: {
        Row: {
          bloqueado_ate: string | null
          definido_em: string
          definido_por: string | null
          employee_id: string
          pin_hash: string
          tentativas: number
        }
        Insert: {
          bloqueado_ate?: string | null
          definido_em?: string
          definido_por?: string | null
          employee_id: string
          pin_hash: string
          tentativas?: number
        }
        Update: {
          bloqueado_ate?: string | null
          definido_em?: string
          definido_por?: string | null
          employee_id?: string
          pin_hash?: string
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "ponto_pins_definido_por_fkey"
            columns: ["definido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_pins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_programacao: {
        Row: {
          data: string
          definido_em: string
          definido_por: string | null
          employee_id: string
          entrada: string | null
          folga: boolean
          intervalo_fim: string | null
          intervalo_inicio: string | null
          motivo: string | null
          saida: string | null
        }
        Insert: {
          data: string
          definido_em?: string
          definido_por?: string | null
          employee_id: string
          entrada?: string | null
          folga?: boolean
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          motivo?: string | null
          saida?: string | null
        }
        Update: {
          data?: string
          definido_em?: string
          definido_por?: string | null
          employee_id?: string
          entrada?: string | null
          folga?: boolean
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          motivo?: string | null
          saida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ponto_programacao_definido_por_fkey"
            columns: ["definido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_programacao_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_vinculos: {
        Row: {
          definido_em: string
          definido_por: string | null
          employee_id: string
          fim: string | null
          id: string
          inicio: string
          jornada_id: string
        }
        Insert: {
          definido_em?: string
          definido_por?: string | null
          employee_id: string
          fim?: string | null
          id?: string
          inicio: string
          jornada_id: string
        }
        Update: {
          definido_em?: string
          definido_por?: string | null
          employee_id?: string
          fim?: string | null
          id?: string
          inicio?: string
          jornada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_vinculos_definido_por_fkey"
            columns: ["definido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_vinculos_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_vinculos_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "ponto_jornadas"
            referencedColumns: ["id"]
          },
        ]
      }
      contabil_meses_travados: {
        Row: {
          competencia: string
          travado_em: string
          travado_por: string | null
          travado_por_nome: string | null
        }
        Insert: {
          competencia: string
          travado_em?: string
          travado_por?: string | null
          travado_por_nome?: string | null
        }
        Update: {
          competencia?: string
          travado_em?: string
          travado_por?: string | null
          travado_por_nome?: string | null
        }
        Relationships: []
      }
      coord_checklists: {
        Row: {
          id: string
          branch_id: string
          data: string
          coordenador_id: string | null
          coordenador_nome: string | null
          gerente_id: string
          gerente_nome: string | null
          notas: Json
          media: number | null
          direcionamentos: string[]
          acordos: string[]
          situacao: string
          criado_em: string
          respondido_em: string | null
          resposta_comentario: string | null
          cancelado_por: string | null
          cancelado_em: string | null
          motivo_cancelamento: string | null
        }
        Insert: {
          id?: string
          branch_id: string
          data: string
          coordenador_id?: string | null
          coordenador_nome?: string | null
          gerente_id: string
          gerente_nome?: string | null
          notas: Json
          media?: number | null
          direcionamentos?: string[]
          acordos?: string[]
          situacao?: string
          criado_em?: string
          respondido_em?: string | null
          resposta_comentario?: string | null
          cancelado_por?: string | null
          cancelado_em?: string | null
          motivo_cancelamento?: string | null
        }
        Update: {
          id?: string
          branch_id?: string
          data?: string
          coordenador_id?: string | null
          coordenador_nome?: string | null
          gerente_id?: string
          gerente_nome?: string | null
          notas?: Json
          media?: number | null
          direcionamentos?: string[]
          acordos?: string[]
          situacao?: string
          criado_em?: string
          respondido_em?: string | null
          resposta_comentario?: string | null
          cancelado_por?: string | null
          cancelado_em?: string | null
          motivo_cancelamento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coord_checklists_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coord_checklists_coordenador_id_fkey"
            columns: ["coordenador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coord_checklists_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coord_checklists_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_coletas: {
        Row: {
          arquivo_b64: string | null
          ate: string
          coletado_em: string
          criado_por: string | null
          de: string
          erro: string | null
          id: string
          lido_em: string | null
          linhas: number | null
          ms: number | null
          parcial: boolean
          relatorio: string
          status: string
          tamanho: number | null
        }
        Insert: {
          arquivo_b64?: string | null
          ate: string
          coletado_em?: string
          criado_por?: string | null
          de: string
          erro?: string | null
          id?: string
          lido_em?: string | null
          linhas?: number | null
          ms?: number | null
          parcial?: boolean
          relatorio: string
          status: string
          tamanho?: number | null
        }
        Update: {
          arquivo_b64?: string | null
          ate?: string
          coletado_em?: string
          criado_por?: string | null
          de?: string
          erro?: string | null
          id?: string
          lido_em?: string | null
          linhas?: number | null
          ms?: number | null
          parcial?: boolean
          relatorio?: string
          status?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_coletas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_filial_dia: {
        Row: {
          atendimentos: number
          atualizado_em: string
          branch_id: string
          coleta_id: string | null
          data: string
          desconto: number
          itens: number
          unidades: number
          valor_bruto: number
          venda: number
        }
        Insert: {
          atendimentos?: number
          atualizado_em?: string
          branch_id: string
          coleta_id?: string | null
          data: string
          desconto?: number
          itens?: number
          unidades?: number
          valor_bruto?: number
          venda?: number
        }
        Update: {
          atendimentos?: number
          atualizado_em?: string
          branch_id?: string
          coleta_id?: string | null
          data?: string
          desconto?: number
          itens?: number
          unidades?: number
          valor_bruto?: number
          venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_filial_dia_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_filial_dia_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "vendas_coletas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_grupo_dia: {
        Row: {
          branch_id: string
          coleta_id: string | null
          custo: number
          data: string
          grupo_codigo: number
          grupo_nome: string
          quantidade: number
          venda: number
        }
        Insert: {
          branch_id: string
          coleta_id?: string | null
          custo?: number
          data: string
          grupo_codigo: number
          grupo_nome: string
          quantidade?: number
          venda?: number
        }
        Update: {
          branch_id?: string
          coleta_id?: string | null
          custo?: number
          data?: string
          grupo_codigo?: number
          grupo_nome?: string
          quantidade?: number
          venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_grupo_dia_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_grupo_dia_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "vendas_coletas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_laboratorio_dia: {
        Row: {
          branch_id: string
          coleta_id: string | null
          custo: number
          data: string
          laboratorio_codigo: number
          laboratorio_nome: string
          quantidade: number
          venda: number
        }
        Insert: {
          branch_id: string
          coleta_id?: string | null
          custo?: number
          data: string
          laboratorio_codigo: number
          laboratorio_nome: string
          quantidade?: number
          venda?: number
        }
        Update: {
          branch_id?: string
          coleta_id?: string | null
          custo?: number
          data?: string
          laboratorio_codigo?: number
          laboratorio_nome?: string
          quantidade?: number
          venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_laboratorio_dia_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_laboratorio_dia_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "vendas_coletas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_metas: {
        Row: {
          alvo: string
          atualizado_em: string
          atualizado_por: string | null
          branch_id: string | null
          chave: string
          id: string
          mes: string
          valor: number
          vendedor_codigo: number | null
        }
        Insert: {
          alvo: string
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          chave: string
          id?: string
          mes: string
          valor: number
          vendedor_codigo?: number | null
        }
        Update: {
          alvo?: string
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          chave?: string
          id?: string
          mes?: string
          valor?: number
          vendedor_codigo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_metas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_tele_filial_dia: {
        Row: {
          atendimentos: number
          atualizado_em: string
          branch_id: string
          coleta_id: string | null
          data: string
          venda: number
        }
        Insert: {
          atendimentos?: number
          atualizado_em?: string
          branch_id: string
          coleta_id?: string | null
          data: string
          venda?: number
        }
        Update: {
          atendimentos?: number
          atualizado_em?: string
          branch_id?: string
          coleta_id?: string | null
          data?: string
          venda?: number
        }
        Relationships: []
      }
      vendas_televendas_vendedores: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          equipe: string
          funcao: string | null
          nome: string
          vendedor_codigo: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          equipe: string
          funcao?: string | null
          nome: string
          vendedor_codigo: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          equipe?: string
          funcao?: string | null
          nome?: string
          vendedor_codigo?: number
        }
        Relationships: []
      }
      vendas_vendedor_vinculo: {
        Row: {
          criado_em: string
          criado_por: string | null
          employee_id: string | null
          profile_id: string | null
          vendedor_codigo: number
          vendedor_nome: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          employee_id?: string | null
          profile_id?: string | null
          vendedor_codigo: number
          vendedor_nome: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          employee_id?: string | null
          profile_id?: string | null
          vendedor_codigo?: number
          vendedor_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_vendedor_vinculo_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_vendedor_vinculo_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_vendedor_dia: {
        Row: {
          atendimentos: number
          branch_id: string
          coleta_id: string | null
          custo: number
          data: string
          ecom_atendimentos: number
          ecom_venda: number
          tele_atendimentos: number
          tele_custo: number
          tele_venda: number
          venda: number
          vendedor_codigo: number
          vendedor_nome: string
        }
        Insert: {
          atendimentos?: number
          branch_id: string
          coleta_id?: string | null
          custo?: number
          data: string
          ecom_atendimentos?: number
          ecom_venda?: number
          tele_atendimentos?: number
          tele_custo?: number
          tele_venda?: number
          venda?: number
          vendedor_codigo: number
          vendedor_nome: string
        }
        Update: {
          atendimentos?: number
          branch_id?: string
          coleta_id?: string | null
          custo?: number
          data?: string
          ecom_atendimentos?: number
          ecom_venda?: number
          tele_atendimentos?: number
          tele_custo?: number
          tele_venda?: number
          venda?: number
          vendedor_codigo?: number
          vendedor_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_vendedor_dia_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_vendedor_dia_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "vendas_coletas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_vendedor_grupo_mes: {
        Row: {
          branch_id: string
          coleta_id: string | null
          custo: number
          desconto: number
          grupo_codigo: number
          grupo_nome: string
          lido_ate: string
          mes: string
          quantidade: number
          venda: number
          vendedor_codigo: number
          vendedor_nome: string
        }
        Insert: {
          branch_id: string
          coleta_id?: string | null
          custo?: number
          desconto?: number
          grupo_codigo: number
          grupo_nome: string
          lido_ate: string
          mes: string
          quantidade?: number
          venda?: number
          vendedor_codigo: number
          vendedor_nome: string
        }
        Update: {
          branch_id?: string
          coleta_id?: string | null
          custo?: number
          desconto?: number
          grupo_codigo?: number
          grupo_nome?: string
          lido_ate?: string
          mes?: string
          quantidade?: number
          venda?: number
          vendedor_codigo?: number
          vendedor_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_vendedor_grupo_mes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_vendedor_grupo_mes_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "vendas_coletas"
            referencedColumns: ["id"]
          },
        ]
      }
      relogio_links: {
        Row: {
          branch_id: string
          criado_em: string
          criado_por: string | null
          id: string
          revogado_em: string | null
          revogado_por: string | null
          token: string | null
          token_hash: string
          ultimo_uso: string | null
          usos: number
        }
        Insert: {
          branch_id: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          revogado_em?: string | null
          revogado_por?: string | null
          token?: string | null
          token_hash: string
          ultimo_uso?: string | null
          usos?: number
        }
        Update: {
          branch_id?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          revogado_em?: string | null
          revogado_por?: string | null
          token?: string | null
          token_hash?: string
          ultimo_uso?: string | null
          usos?: number
        }
        Relationships: [
          {
            foreignKeyName: "relogio_links_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relogio_links_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relogio_links_revogado_por_fkey"
            columns: ["revogado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          formula: string | null
          id: string
          importacao_id: string
          linha: string
          manual: boolean
          origem: string | null
          valor: number
        }
        Insert: {
          branch_id?: string | null
          competencia: string
          empresa: string
          formula?: string | null
          id?: string
          importacao_id: string
          linha: string
          manual?: boolean
          origem?: string | null
          valor: number
        }
        Update: {
          branch_id?: string | null
          competencia?: string
          empresa?: string
          formula?: string | null
          id?: string
          importacao_id?: string
          linha?: string
          manual?: boolean
          origem?: string | null
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
      dre_contabil_rateios: {
        Row: {
          competencia: string
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          empresa: string
          id: string
          item: string
          linha: string
          observacao: string | null
          valor: number
        }
        Insert: {
          competencia: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa: string
          id?: string
          item: string
          linha: string
          observacao?: string | null
          valor: number
        }
        Update: {
          competencia?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa?: string
          id?: string
          item?: string
          linha?: string
          observacao?: string | null
          valor?: number
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
          assinatura: string | null
          assinado_path: string | null
          assinado_em: string | null
          assinado_por: string | null
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
          assinatura?: string | null
          assinado_path?: string | null
          assinado_em?: string | null
          assinado_por?: string | null
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
          assinatura?: string | null
          assinado_path?: string | null
          assinado_em?: string | null
          assinado_por?: string | null
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
      esc_filiais: {
        Row: {
          acordo_jornada_estendida: boolean
          atualizado_em: string
          atualizado_por: string | null
          branch_id: string
          domingo_abre: string | null
          domingo_fecha: string | null
          folgas_permitidas: number[]
          min_farmaceuticos: number
          origem: string | null
          sabado_abre: string | null
          sabado_fecha: string | null
          semana_abre: string | null
          semana_fecha: string | null
        }
        Insert: {
          acordo_jornada_estendida?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id: string
          domingo_abre?: string | null
          domingo_fecha?: string | null
          folgas_permitidas?: number[]
          min_farmaceuticos?: number
          origem?: string | null
          sabado_abre?: string | null
          sabado_fecha?: string | null
          semana_abre?: string | null
          semana_fecha?: string | null
        }
        Update: {
          acordo_jornada_estendida?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string
          domingo_abre?: string | null
          domingo_fecha?: string | null
          folgas_permitidas?: number[]
          min_farmaceuticos?: number
          origem?: string | null
          sabado_abre?: string | null
          sabado_fecha?: string | null
          semana_abre?: string | null
          semana_fecha?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "esc_filiais_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esc_filiais_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      esc_colaboradores: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          branch_id: string
          cargo_origem: string | null
          criado_em: string
          employee_id: string | null
          funcao: string
          horario_origem: Json | null
          horas_dia: number | null
          id: string
          intervalo_min: number
          nome: string
          observacoes: string | null
          ordem: number
          origem: string
          regime: string
          registro: string | null
          revisar: boolean
          situacao: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id: string
          cargo_origem?: string | null
          criado_em?: string
          employee_id?: string | null
          funcao: string
          horario_origem?: Json | null
          horas_dia?: number | null
          id?: string
          intervalo_min?: number
          nome: string
          observacoes?: string | null
          ordem?: number
          origem?: string
          regime?: string
          registro?: string | null
          revisar?: boolean
          situacao?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string
          cargo_origem?: string | null
          criado_em?: string
          employee_id?: string | null
          funcao?: string
          horario_origem?: Json | null
          horas_dia?: number | null
          id?: string
          intervalo_min?: number
          nome?: string
          observacoes?: string | null
          ordem?: number
          origem?: string
          regime?: string
          registro?: string | null
          revisar?: boolean
          situacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "esc_colaboradores_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esc_colaboradores_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esc_colaboradores_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      esc_simulacoes: {
        Row: {
          alertas: Json
          alertas_base: Json | null
          analisado_em: string | null
          analise: Json | null
          analise_pendente: boolean
          ano: number
          atualizado_em: string
          branch_id: string
          cobertura: Json
          config: Json
          criado_em: string
          criado_por: string | null
          equipe: Json
          folgas_permitidas: number[]
          continua: boolean
          inicio: string | null
          id: string
          jornada_semanal: number
          lote: string
          mes: number
          opcao: number
          publicado_em: string | null
          publicado_por: string | null
          qtd_alertas: number | null
          situacao: string
        }
        Insert: {
          alertas?: Json
          alertas_base?: Json | null
          analisado_em?: string | null
          analise?: Json | null
          analise_pendente?: boolean
          ano: number
          atualizado_em?: string
          branch_id: string
          cobertura: Json
          config: Json
          criado_em?: string
          criado_por?: string | null
          equipe: Json
          folgas_permitidas: number[]
          continua?: boolean
          inicio?: string | null
          id?: string
          jornada_semanal: number
          lote: string
          mes: number
          opcao: number
          publicado_em?: string | null
          publicado_por?: string | null
          qtd_alertas?: never
          situacao?: string
        }
        Update: {
          alertas?: Json
          alertas_base?: Json | null
          analisado_em?: string | null
          analise?: Json | null
          analise_pendente?: boolean
          ano?: number
          atualizado_em?: string
          branch_id?: string
          cobertura?: Json
          config?: Json
          criado_em?: string
          criado_por?: string | null
          equipe?: Json
          folgas_permitidas?: number[]
          continua?: boolean
          inicio?: string | null
          id?: string
          jornada_semanal?: number
          lote?: string
          mes?: number
          opcao?: number
          publicado_em?: string | null
          publicado_por?: string | null
          qtd_alertas?: never
          situacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "esc_simulacoes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esc_simulacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esc_simulacoes_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          gerente_employee_id: string | null
          ponto_branch_id: string | null
          ponto_filial_id: string | null
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
          pis: string | null
          nome_mae: string | null
          nome_pai: string | null
          endereco: string | null
          endereco_numero: string | null
          bairro: string | null
          cidade: string | null
          uf: string | null
          cep: string | null
          celular: string | null
          escolaridade: string | null
          estado_civil: string | null
          rg: string | null
          rg_emissao: string | null
          rg_emissor: string | null
          rg_uf: string | null
          raca_cor: string | null
          titulo_eleitor: string | null
          titulo_zona: string | null
          titulo_secao: string | null
          cnh: string | null
          cnh_emissao: string | null
          cnh_vencimento: string | null
          cnh_categoria: string | null
          reservista: string | null
          reservista_categoria: string | null
          horario_trabalho: string | null
          periodo_experiencia: string | null
          adicionais: string | null
        }
        Insert: {
          gerente_employee_id?: string | null
          ponto_branch_id?: string | null
          ponto_filial_id?: never
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
          pis?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          endereco?: string | null
          endereco_numero?: string | null
          bairro?: string | null
          cidade?: string | null
          uf?: string | null
          cep?: string | null
          celular?: string | null
          escolaridade?: string | null
          estado_civil?: string | null
          rg?: string | null
          rg_emissao?: string | null
          rg_emissor?: string | null
          rg_uf?: string | null
          raca_cor?: string | null
          titulo_eleitor?: string | null
          titulo_zona?: string | null
          titulo_secao?: string | null
          cnh?: string | null
          cnh_emissao?: string | null
          cnh_vencimento?: string | null
          cnh_categoria?: string | null
          reservista?: string | null
          reservista_categoria?: string | null
          horario_trabalho?: string | null
          periodo_experiencia?: string | null
          adicionais?: string | null
        }
        Update: {
          gerente_employee_id?: string | null
          ponto_branch_id?: string | null
          ponto_filial_id?: never
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
          pis?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          endereco?: string | null
          endereco_numero?: string | null
          bairro?: string | null
          cidade?: string | null
          uf?: string | null
          cep?: string | null
          celular?: string | null
          escolaridade?: string | null
          estado_civil?: string | null
          rg?: string | null
          rg_emissao?: string | null
          rg_emissor?: string | null
          rg_uf?: string | null
          raca_cor?: string | null
          titulo_eleitor?: string | null
          titulo_zona?: string | null
          titulo_secao?: string | null
          cnh?: string | null
          cnh_emissao?: string | null
          cnh_vencimento?: string | null
          cnh_categoria?: string | null
          reservista?: string | null
          reservista_categoria?: string | null
          horario_trabalho?: string | null
          periodo_experiencia?: string | null
          adicionais?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_gerente_employee_id_fkey"
            columns: ["gerente_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_ponto_branch_id_fkey"
            columns: ["ponto_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
      fin_caixa_omie: {
        Row: {
          branch_id: string | null
          categoria_codigo: string
          categoria_nome: string | null
          coletado_em: string
          data: string
          departamento_codigo: string
          departamento_nome: string | null
          empresa: string
          grupo: string
          id: number
          movimentos: number
          natureza: string
          valor: number
        }
        Insert: {
          branch_id?: string | null
          categoria_codigo?: string
          categoria_nome?: string | null
          coletado_em?: string
          data: string
          departamento_codigo?: string
          departamento_nome?: string | null
          empresa: string
          grupo?: string
          id?: never
          movimentos?: number
          natureza: string
          valor: number
        }
        Update: {
          branch_id?: string | null
          categoria_codigo?: string
          categoria_nome?: string | null
          coletado_em?: string
          data?: string
          departamento_codigo?: string
          departamento_nome?: string | null
          empresa?: string
          grupo?: string
          id?: never
          movimentos?: number
          natureza?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_caixa_omie_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_caixa_omie_dias: {
        Row: {
          coletado_em: string
          data: string
          empresa: string
          movimentos: number
          total_pago: number | null
          total_recebido: number | null
        }
        Insert: {
          coletado_em?: string
          data: string
          empresa: string
          movimentos: number
          total_pago?: number | null
          total_recebido?: number | null
        }
        Update: {
          coletado_em?: string
          data?: string
          empresa?: string
          movimentos?: number
          total_pago?: number | null
          total_recebido?: number | null
        }
        Relationships: []
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
          omie_nazario: number | null
          omie_varela: number | null
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
          omie_nazario?: number | null
          omie_varela?: number | null
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
          omie_nazario?: number | null
          omie_varela?: number | null
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
          formula: string | null
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
          formula?: string | null
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
          formula?: string | null
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
      fin_dre_ajustes_linhas: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          branch_id: string | null
          chave: string | null
          competencia: string
          formula: string | null
          grupo: string
          id: string
          linha: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          chave?: string | null
          competencia: string
          formula?: string | null
          grupo?: string
          id?: string
          linha: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          branch_id?: string | null
          chave?: string | null
          competencia?: string
          formula?: string | null
          grupo?: string
          id?: string
          linha?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_dre_ajustes_linhas_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_dre_ajustes_linhas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
          formula: string | null
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
          formula?: string | null
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
          formula?: string | null
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
      folha_eventos_filial: {
        Row: {
          arquivo: string | null
          branch_id: string
          codigo: number
          coluna: number
          evento_id: string | null
          rotulo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          arquivo?: string | null
          branch_id: string
          codigo: number
          coluna: number
          evento_id?: string | null
          rotulo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          arquivo?: string | null
          branch_id?: string
          codigo?: number
          coluna?: number
          evento_id?: string | null
          rotulo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folha_eventos_filial_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_eventos_filial_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "folha_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_eventos_filial_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          omie_codigo: number | null
          omie_empresa: string | null
          omie_enviado_em: string | null
          omie_enviado_por_nome: string | null
          omie_mensagem: string | null
          omie_situacao: string | null
          omie_sugerido: number | null
          omie_vinculada: boolean
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
          omie_codigo?: number | null
          omie_empresa?: string | null
          omie_enviado_em?: string | null
          omie_enviado_por_nome?: string | null
          omie_mensagem?: string | null
          omie_situacao?: string | null
          omie_sugerido?: number | null
          omie_vinculada?: boolean
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
          omie_codigo?: number | null
          omie_empresa?: string | null
          omie_enviado_em?: string | null
          omie_enviado_por_nome?: string | null
          omie_mensagem?: string | null
          omie_situacao?: string | null
          omie_sugerido?: number | null
          omie_vinculada?: boolean
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
      ia_materiais: {
        Row: {
          busca: unknown
          chave: string
          criado_em: string
          id: number
          material: string
          pagina: number
          texto: string
        }
        Insert: {
          busca?: unknown
          chave: string
          criado_em?: string
          id?: never
          material: string
          pagina: number
          texto: string
        }
        Update: {
          busca?: unknown
          chave?: string
          criado_em?: string
          id?: never
          material?: string
          pagina?: number
          texto?: string
        }
        Relationships: []
      }
      ia_conversas: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          titulo: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          titulo: string
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          criado_em: string
          ordem: number
          papel: string
        }
        Insert: {
          conteudo: string
          conversa_id: string
          criado_em?: string
          ordem: number
          papel: string
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          criado_em?: string
          ordem?: number
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "ia_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_uso: {
        Row: {
          cache_escrita: number
          cache_leitura: number
          conversa_id: string | null
          criado_em: string
          custo_usd: number
          entrada: number
          id: number
          modelo: string
          saida: number
          user_id: string
        }
        Insert: {
          cache_escrita?: number
          cache_leitura?: number
          conversa_id?: string | null
          criado_em?: string
          custo_usd: number
          entrada?: number
          id?: never
          modelo: string
          saida?: number
          user_id?: string
        }
        Update: {
          cache_escrita?: number
          cache_leitura?: number
          conversa_id?: string | null
          criado_em?: string
          custo_usd?: number
          entrada?: number
          id?: never
          modelo?: string
          saida?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_uso_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "ia_conversas"
            referencedColumns: ["id"]
          },
        ]
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
          razao_declaracao: string | null
          endereco_declaracao: string | null
          socio_nome: string | null
          socio_cpf: string | null
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_fantasia?: string | null
          razao_social: string
          updated_at?: string
          razao_declaracao?: string | null
          endereco_declaracao?: string | null
          socio_nome?: string | null
          socio_cpf?: string | null
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_fantasia?: string | null
          razao_social?: string
          updated_at?: string
          razao_declaracao?: string | null
          endereco_declaracao?: string | null
          socio_nome?: string | null
          socio_cpf?: string | null
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
      rh_assinatura_socio: {
        Row: { atualizado_em: string; imagem: string; organization_id: string }
        Insert: { atualizado_em?: string; imagem: string; organization_id: string }
        Update: { atualizado_em?: string; imagem?: string; organization_id?: string }
        Relationships: []
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
          convite_enviado_em: string | null
          created_at: string
          email: string | null
          employee_id: string | null
          id: string
          modulos_bloqueados: string[]
          nome: string
          papel: Database["public"]["Enums"]["app_role"]
          papeis_leitura: string[]
          regional: string | null
          ultimo_acesso: string | null
          updated_at: string
        }
        Insert: {
          admin_sistema?: boolean
          ativo?: boolean
          branch_id?: string | null
          convite_enviado_em?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id: string
          modulos_bloqueados?: string[]
          nome?: string
          papel?: Database["public"]["Enums"]["app_role"]
          papeis_leitura?: string[]
          regional?: string | null
          ultimo_acesso?: string | null
          updated_at?: string
        }
        Update: {
          admin_sistema?: boolean
          ativo?: boolean
          branch_id?: string | null
          convite_enviado_em?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id?: string
          modulos_bloqueados?: string[]
          nome?: string
          papel?: Database["public"]["Enums"]["app_role"]
          papeis_leitura?: string[]
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
      wpp_agente: {
        Row: {
          conectado: boolean
          criado_em: string | null
          criado_por: string | null
          id: number
          numero: string | null
          situacao: string | null
          token_hash: string | null
          ultimo_contato: string | null
        }
        Insert: {
          conectado?: boolean
          criado_em?: string | null
          criado_por?: string | null
          id?: number
          numero?: string | null
          situacao?: string | null
          token_hash?: string | null
          ultimo_contato?: string | null
        }
        Update: {
          conectado?: boolean
          criado_em?: string | null
          criado_por?: string | null
          id?: number
          numero?: string | null
          situacao?: string | null
          token_hash?: string | null
          ultimo_contato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wpp_agente_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wpp_destinos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          categoria: Database["public"]["Enums"]["ticket_category"]
          grupo_jid: string | null
          grupo_nome: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          categoria: Database["public"]["Enums"]["ticket_category"]
          grupo_jid?: string | null
          grupo_nome?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          categoria?: Database["public"]["Enums"]["ticket_category"]
          grupo_jid?: string | null
          grupo_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wpp_destinos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wpp_fila: {
        Row: {
          categoria: Database["public"]["Enums"]["ticket_category"] | null
          criado_em: string
          enviado_em: string | null
          erro: string | null
          grupo_jid: string
          id: number
          mensagem: string | null
          tentativas: number
          ticket_id: string | null
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["ticket_category"] | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          grupo_jid: string
          id?: number
          mensagem?: string | null
          tentativas?: number
          ticket_id?: string | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["ticket_category"] | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          grupo_jid?: string
          id?: number
          mensagem?: string | null
          tentativas?: number
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wpp_fila_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      wpp_grupos: {
        Row: {
          atualizado_em: string
          jid: string
          nome: string
        }
        Insert: {
          atualizado_em?: string
          jid: string
          nome: string
        }
        Update: {
          atualizado_em?: string
          jid?: string
          nome?: string
        }
        Relationships: []
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
      gi_conc_boletos_vistos: {
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
            foreignKeyName: "gi_conc_itens_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "gi_conc_conciliacoes"
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
      aud_lojas: {
        Args: never
        Returns: {
          cnpj: string
          codigo: string
          gerente: string
          id: string
          nome: string
          razao_social: string
          regional: string
        }[]
      }
      ia_gastos: {
        Args: never
        Returns: {
          hoje_usuario: number
          mes_total: number
        }[]
      }
      ia_buscar_materiais: {
        Args: { p_busca: string; p_chave?: string; p_limite?: number }
        Returns: {
          chave: string
          material: string
          pagina: number
          texto: string
          relevancia: number
        }[]
      }
      fin_fluxo_importar_pagar: {
        Args: {
          p_arquivo: string
          p_empresa: string
          p_gerado: string
          p_linhas: Json
        }
        Returns: string
      }
      fin_fluxo_pagar_somas: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          categoria: string
          data: string
          empresa: string
          grupo: string
          valor: number
        }[]
      }
      folha_codigos_dominio_importar: {
        Args: { p_filiais: Json }
        Returns: number
      }
      conc_reservar_envio: { Args: { p_ids: string[] }; Returns: string[] }
      conc_liberar_envio: { Args: { p_ids: string[] }; Returns: undefined }
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
      gi_conc_fornecedor_ficha: {
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
      gi_conc_fornecedor_historico: {
        Args: { p_raizes: string[] }
        Returns: {
          bancos: string[]
          cnpjs: string[]
          n: number
          raiz: string
          valores: Json
        }[]
      }
      gi_conc_fornecedores_lista: {
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
      gi_conc_regras_registrar_uso: {
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
      ponto_auditoria: {
        Args: {
          p_ate: string | null
          p_branch: string | null
          p_de: string | null
          p_entidade: string | null
          p_limite: number
          p_pagina: number
        }
        Returns: {
          acao: string
          autor: string
          branch_id: string | null
          criado_em: string
          entidade: string
          funcionario: string | null
          id: string
          registro_id: string | null
          total: number
          valor_anterior: Json | null
          valor_novo: Json | null
        }[]
      }
      ponto_cancelar_ajuste: { Args: { p_id: string }; Returns: undefined }
      ponto_decidir_ajuste: {
        Args: {
          p_aprovar: boolean
          p_id: string
          p_motivo_fechado: string | null
          p_resposta: string | null
        }
        Returns: undefined
      }
      ponto_definir_pin: {
        Args: { p_employee: string; p_pin: string }
        Returns: undefined
      }
      ponto_equipe: {
        Args: {
          p_branch: string | null
          p_departamento: string | null
          p_desligados: boolean
          p_ids: string[] | null
          p_q: string | null
        }
        Returns: {
          branch_id: string
          cargo: string | null
          data_admissao: string | null
          data_desligamento: string | null
          department_id: string | null
          departamento: string | null
          filial_codigo: string
          filial_nome: string
          id: string
          matricula: string | null
          nome: string
          status: string
        }[]
      }
      ponto_fechar_mes: {
        Args: {
          p_branch: string
          p_competencia: string
          p_resumo: Json
          p_saldos: Json
        }
        Returns: string
      }
      ponto_nomes: {
        Args: { p_ids: string[] }
        Returns: { id: string; nome: string }[]
      }
      ponto_reabrir_mes: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      ponto_registrar: {
        Args: {
          p_branch?: string
          p_dispositivo: string | null
          p_employee: string
          p_ip: string | null
          p_latitude: number | null
          p_longitude: number | null
          p_metodo: string
          p_pin: string | null
          p_precisao: number | null
          p_tipo: string | null
        }
        Returns: Json
      }
      ponto_relogio_identificar: {
        Args: { p_branch: string; p_matricula: string }
        Returns: Json
      }
      ponto_cadastrar_digital: { Args: { p_employee: string; p_dedo: number; p_template: string; p_leitor: string }; Returns: undefined }
      ponto_digitais_cadastradas: { Args: { p_employees: string[] }; Returns: { employee_id: string; dedo: number }[] }
      conc_contagem_abas: { Args: { p_conciliacao: string }; Returns: Json }
      conc_pendencias_novas: { Args: { p_de: string }; Returns: { dia: string; qtd: number }[] }
      folha_equipe: { Args: { p_competencia: string }; Returns: Json }
      conc_resumo_periodo: { Args: { p_conciliacao: string }; Returns: { filial: number | null; grupo: string; qtd: number; valor: number; qtd_aberto: number; valor_aberto: number }[] }
      ponto_digital_identificar: { Args: { p_desafio: string; p_employee: string; p_dedo: number; p_assinatura: string }; Returns: Json }
      ponto_digital_iniciar_filial: { Args: { p_branch: string; p_leitor: string }; Returns: Json }
      ponto_extra_cancelar: { Args: { p_id: string }; Returns: undefined }
      ponto_extra_liberar: { Args: { p_employee: string; p_dia: string; p_ticket: string }; Returns: string }
      ponto_leitor_garantir: { Args: { p_branch: string; p_leitor: string | null; p_nome: string }; Returns: Json }
      ponto_leitor_revogar: { Args: { p_leitor: string }; Returns: undefined }
      ponto_leitores_lista: { Args: never; Returns: { id: string; branch_id: string; nome: string | null; ativo: boolean; ativado_em: string | null; codigo_expira: string | null; ultimo_uso: string | null }[] }
      ponto_registrar_digital: { Args: { p_desafio: string; p_dedo: number; p_assinatura: string; p_tipo: string | null; p_dispositivo: string | null; p_ip: string | null }; Returns: Json }
      rh_documento_devolver_assinado: { Args: { p_documento: string; p_caminho: string }; Returns: undefined }
      ponto_remover_digital: { Args: { p_employee: string; p_dedo: number }; Returns: undefined }
      ponto_tem_pin: { Args: { p_employees: string[] }; Returns: string[] }
      relogio_desconectar: { Args: { p_branch: string }; Returns: number }
      rh_gerentes_opcoes: {
        Args: never
        Returns: {
          cargo: string
          filial_codigo: string
          id: string
          nome: string
          responsavel_de: string
          tem_login: boolean
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
      dre_contabil_lancar_manual: {
        Args: { p_competencia: string; p_empresa: string; p_valores: Json }
        Returns: number
      }
      dre_contabil_preencher_omie: {
        Args: { p_competencia: string }
        Returns: number
      }
      dre_devolucoes_trier_gravar: {
        Args: { p_arquivo: string; p_competencia: string; p_valores: Json }
        Returns: Json
      }
      dre_receita_trier_gravar: {
        Args: { p_arquivo: string; p_competencia: string; p_valores: Json }
        Returns: Json
      }
      caixa_quebra_folha_definir: {
        Args: { p_ligado: boolean }
        Returns: number
      }
      caixa_quebra_folha_ligada: {
        Args: never
        Returns: boolean
      }
      contas_para_deposito: {
        Args: never
        Returns: {
          apelido: string
          banco: string
          empresas: string[]
          id: string
          tipo: string
        }[]
      }
      coord_gerentes: {
        Args: never
        Returns: {
          id: string
          lojas: string[]
          nome: string
        }[]
      }
      coord_lojas: {
        Args: never
        Returns: {
          codigo: string
          id: string
          nome: string
        }[]
      }
      coord_ranking: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          anterior_media: number | null
          branch_id: string
          codigo: string
          media: number | null
          nome: string
          pior_item: string | null
          pior_nota: number | null
          qtd: number
          regional: string | null
          ultima_data: string | null
          ultima_media: number | null
        }[]
      }
      usuarios_acesso: {
        Args: never
        Returns: {
          confirmado: boolean
          convidado_em: string | null
          id: string
          ultimo_login: string | null
        }[]
      }
      vendas_dias: {
        Args: {
          p_ate: string
          p_de: string
        }
        Returns: string[]
      }
      dashboard_filiais: {
        Args: never
        Returns: {
          aso_vencidos: number
          branch_id: string
          caixas_recentes: number
          chamados_abertos: number
          codigo: string
          conc_abertas: number
          conc_em: string | null
          conc_pct: number | null
          conc_vencidas: number
          nome: string
          quebras_abertas: number
          quebras_paradas: number
          quebras_total: number
          quebras_valor: number
          regional: string | null
        }[]
      }
      vendas_hoje_lido_em: {
        Args: never
        Returns: string
      }
      vendas_filiais: {
        Args: {
          p_ate: string
          p_de: string
        }
        Returns: {
            atendimentos: number
            branch_id: string | null
            codigo: string
            custo: number
            dias: number
            fortvigor: number
            generico: number
            itens: number
            nome: string
            premium: number
            referencia: number
            regional: string | null
            similares: number
            unidades: number
            venda: number
            venda_grupos: number
        }[]
      }
      vendas_serie: {
        Args: {
          p_ate: string
          p_de: string
          p_por?: string
        }
        Returns: {
            atendimentos: number
            custo: number
            generico: number
            periodo: string
            premium: number
            referencia: number
            regional: string
            similares: number
            unidades: number
            venda: number
            venda_grupos: number
        }[]
      }
      vendas_tele_por_filial: {
        Args: {
          p_ate: string
          p_de: string
          p_por: string
        }
        Returns: {
            atendimentos: number
            branch_id: string
            central_id: string | null
            custo: number
            generico: number
            periodo: string
            premium: number
            referencia: number
            similares: number
            unidades: number
            venda: number
        }[]
      }
      vendas_minhas: {
        Args: {
          p_ate: string
          p_de: string
          p_employee?: string
          p_profile?: string
        }
        Returns: Json
      }
      vendas_vendedores_periodo: {
        Args: {
          p_ate: string
          p_de: string
        }
        Returns: {
          atendimentos: number
          branch_id: string
          codigo: string
          loja: string
          regional: string | null
          televendas: boolean
          venda: number
          vendedor_codigo: number
          vendedor_nome: string
        }[]
      }
      televendas_definir_responsavel: {
        Args: {
          p_mover?: boolean
          p_profile: string | null
        }
        Returns: number
      }
      televendas_sangrias_abertas: {
        Args: never
        Returns: number
      }
      vendas_televendas_grupos: {
        Args: {
          p_ate: string
          p_de: string
        }
        Returns: {
          custo: number
          grupo_codigo: number
          grupo_nome: string
          unidades: number
          venda: number
          vendedor_codigo: number
        }[]
      }
      vendas_televendas: {
        Args: {
          p_ate: string
          p_de: string
        }
        Returns: {
          atendimentos: number
          branch_id: string
          codigo: string
          custo: number
          dias: number
          ecom_venda: number
          equipe: string
          funcao: string | null
          loja: string
          regional: string | null
          tele_atendimentos: number
          tele_venda: number
          venda: number
          vendedor_codigo: number
          vendedor_nome: string
        }[]
      }
      lojas_para_sangria: {
        Args: never
        Returns: {
          codigo: string
          empresa: string | null
          id: string
          nome: string
        }[]
      }
      integracao_posso_ler: { Args: never; Returns: boolean }
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
        | "lider_loja"
        | "usuario"
        | "contador"
        | "coordenador"
        | "manutencao"
        | "compras"
        | "diretor_compras"
        | "marketing"
        | "relogio"
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
        | "rescisao"
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
        "lider_loja",
        "usuario",
        "contador",
        "coordenador",
        "manutencao",
        "compras",
        "diretor_compras",
        "marketing",
        "relogio",
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
        "rescisao",
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
