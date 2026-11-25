import { useEffect, useRef } from 'preact/hooks';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Prec } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

/** oneDark по умолчанию даёт контраст ниже 4.5:1 (WCAG AA); слегка затемняем фон и подсвечиваем номера строк. */
const darkContrast = EditorView.theme(
  {
    '&': { backgroundColor: '#1a1e26' },
    '.cm-gutters': { backgroundColor: '#1a1e26', color: '#aab3c5', borderRight: '1px solid #2b3445' },
    '.cm-activeLine': { backgroundColor: '#222833' },
    '.cm-activeLineGutter': { backgroundColor: '#222833', color: '#d0d6e2' },
  },
  { dark: true },
);

interface Props {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  dark: boolean;
  minHeight?: string;
  label?: string;
}

export function CodeEditorImpl({ value, onChange, readOnly, dark, minHeight, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    const extensions = [
      basicSetup,
      javascript(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': label ?? (readOnly ? 'Код примера (только чтение)' : 'Редактор кода') }),
      EditorState.readOnly.of(!!readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange?.(u.state.doc.toString());
      }),
      ...(dark ? [Prec.highest(darkContrast), oneDark] : []),
    ];
    const v = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host.current! });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, readOnly]);

  // внешнее изменение значения (смена сценария)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div class="code-editor" ref={host} style={minHeight ? { minHeight } : undefined} />;
}
