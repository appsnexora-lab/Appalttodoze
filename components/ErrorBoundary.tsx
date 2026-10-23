import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (err) {
        console.warn('Erro ao executar onReset no ErrorBoundary:', err);
      }
    }
  };

  private handleClearCorruptedState = () => {
    try {
      localStorage.removeItem('altto_selected_bible_book_id');
      localStorage.removeItem('altto_devotional_book_id');
      localStorage.removeItem('altto_active_tab');
      localStorage.removeItem('altto_bible_plan_config');
    } catch {}
    this.handleReload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[360px] w-full flex flex-col items-center justify-center p-6 text-center bg-white rounded-3xl border border-[#EAE5F4] shadow-xs my-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shadow-xs">
            <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-bold font-serif text-[#29243A]">
              {this.props.fallbackTitle || 'Algo inesperado aconteceu nesta seção'}
            </h3>
            <p className="text-xs text-[#827A96]">
              Seus dados e livros estão salvos com segurança. Clique abaixo para restaurar a visualização.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleReload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-lilas font-bold text-xs shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restaurar visualização</span>
            </button>
            <button
              onClick={this.handleClearCorruptedState}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-[#FAF9FD] text-[#29243A] border border-[#EAE5F4] font-semibold text-xs transition-colors cursor-pointer"
            >
              <span>Reiniciar Dados Iniciais</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
