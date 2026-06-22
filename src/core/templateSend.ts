import type { Template } from '../types/entities';
import type { SendTemplateInput } from '../providers/provider.interface';

/** Parámetros de envío derivados de una plantilla almacenada. */
export function templateSendOptions(
  template: Template,
  variables: string[],
): Pick<
  SendTemplateInput,
  | 'templateName'
  | 'languageCode'
  | 'templateCategory'
  | 'variables'
  | 'headerImageUrl'
  | 'headerTextVariables'
  | 'buttonUrlVariables'
> {
  const buttonUrlVariables = template.botones
    .map((btn, index) => ({ btn, index }))
    .filter(({ btn }) => btn.tipo === 'url' && btn.url && /\{\{\d+\}\}/.test(btn.url))
    .map(({ index }) => ({ index, text: '' }));

  return {
    templateName: template.nombreMeta,
    languageCode: template.idioma,
    templateCategory: template.categoria,
    variables,
    headerImageUrl: template.headerTipo === 'image' ? template.headerUrl : null,
    headerTextVariables:
      template.headerTipo === 'text' && template.headerText && /\{\{\d+\}\}/.test(template.headerText)
        ? []
        : undefined,
    buttonUrlVariables: buttonUrlVariables.length ? buttonUrlVariables : undefined,
  };
}

/** Sustituye {{1}}, {{2}}… en un texto (vista previa). */
export function renderTemplateText(text: string, variables: string[]): string {
  let out = text;
  variables.forEach((v, i) => {
    out = out.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v);
  });
  return out;
}
