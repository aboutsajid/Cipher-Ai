import {
  buildCrudDomainContentForFocus,
  buildDashboardDomainContentForFocus,
  type HeuristicDomainFocus
} from "./heuristicDashboardCrudDomainContent";
import {
  buildStaticCrudHtmlTemplate,
  buildStaticCrudJsTemplate,
  buildStaticDashboardHtmlTemplate,
  buildStaticDashboardJsTemplate
} from "./heuristicStaticDashboardCrudTemplates";
import {
  buildCrudAppTsxTemplate,
  buildDashboardTsxTemplate
} from "./heuristicReactDashboardCrudTemplates";
import { toDisplayLabel as toDisplayLabelText } from "./projectNaming";

export function buildStaticDashboardHtmlForDomain(title: string, domainFocus: HeuristicDomainFocus = "generic"): string {
  const content = buildDashboardDomainContentForFocus(domainFocus);
  return buildStaticDashboardHtmlTemplate(title, content);
}

export function buildStaticDashboardJsForDomain(domainFocus: HeuristicDomainFocus = "generic"): string {
  const content = buildDashboardDomainContentForFocus(domainFocus);
  return buildStaticDashboardJsTemplate(content);
}

export function buildStaticCrudHtmlForDomain(title: string, domainFocus: HeuristicDomainFocus = "generic"): string {
  const content = buildCrudDomainContentForFocus(domainFocus);
  return buildStaticCrudHtmlTemplate(
    title,
    content,
    toDisplayLabelText(content.singularLabel),
    toDisplayLabelText(content.pluralLabel)
  );
}

export function buildStaticCrudJsForDomain(domainFocus: HeuristicDomainFocus = "generic"): string {
  const content = buildCrudDomainContentForFocus(domainFocus);
  return buildStaticCrudJsTemplate(content);
}

export function buildDashboardTsxForDomain(title: string, domainFocus: HeuristicDomainFocus = "generic"): string {
  const content = buildDashboardDomainContentForFocus(domainFocus);
  return buildDashboardTsxTemplate(title, content);
}

export function buildCrudAppTsxForDomain(title: string, domainFocus: HeuristicDomainFocus = "generic"): string {
  const content = buildCrudDomainContentForFocus(domainFocus);
  return buildCrudAppTsxTemplate(title, content, toDisplayLabelText(content.pluralLabel));
}
