import search16 from "@carbon/icons/es/search/16.js";
import { debounce, useQueryStates } from "nuqs";
import { Button } from "@crm/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@crm/ui/components/empty";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@crm/ui/components/input-group";
import { CloseGlyph } from "@crm/ui/patterns/close-glyph";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";

import { listUrlKeys, searchParsers } from "./list-search-params";

const SearchIcon = carbonIcon(search16);

const SEARCH_KEYS = Object.keys(searchParsers);

/** Wait this long after the last keystroke before the URL (and the query) follows the field. */
const SEARCH_DELAY_MS = 250;

/**
 * The search field. Hidden where its container (the table, or the toolbar holding it) is narrower
 * than 42rem: the viewport can't tell, since the sidebar takes part of it. It fades in when a
 * resize brings it back (`wide-only`); wrappers use `wide-slot`, which hides without fading.
 */
export function ListSearch({ placeholder, scope }: { placeholder: string; scope?: string }) {
  const [{ q }, setState] = useQueryStates(searchParsers, {
    limitUrlUpdates: debounce(SEARCH_DELAY_MS),
    urlKeys: listUrlKeys(scope, SEARCH_KEYS),
  });

  return (
    <div className="wide-only @2xl:w-80">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={placeholder}
          autoComplete="off"
          onChange={(event) => void setState({ q: event.target.value, page: 1 })}
          placeholder={placeholder}
          type="search"
          value={q}
        />
        {q ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={UI_COPY.clearSearch}
              onClick={() => void setState({ q: "", page: 1 })}
              size="icon-xs"
            >
              <CloseGlyph />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </div>
  );
}

export function NoSearchMatch({
  query,
  noun,
  scope,
}: {
  query: string;
  noun: string;
  scope?: string;
}) {
  const [, setState] = useQueryStates(searchParsers, {
    urlKeys: listUrlKeys(scope, SEARCH_KEYS),
  });

  return (
    <Empty>
      <EmptyMedia variant="icon">
        <SearchIcon />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{UI_COPY.noSearchMatch({ noun, query })}</EmptyTitle>
        <EmptyDescription>{UI_COPY.noSearchMatchHint}</EmptyDescription>
      </EmptyHeader>
      <Button onClick={() => void setState({ q: "", page: 1 })} size="sm" variant="outline">
        {UI_COPY.clearSearch}
      </Button>
    </Empty>
  );
}
