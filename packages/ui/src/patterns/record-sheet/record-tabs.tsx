import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import type { ReactNode } from "react";

export type RecordTabSpec<Tab extends string = string> = {
  id: Tab;
  label: string;
  content: ReactNode;
  fills?: boolean;
};

function keepInView(tab: HTMLElement | null) {
  const scroller = tab?.closest("[data-slot=record-tabs]");

  if (!tab || !(scroller instanceof HTMLElement)) return;

  const reveal = () => {
    const tabBox = tab.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();

    if (tabBox.left < box.left) scroller.scrollLeft -= box.left - tabBox.left;

    if (tabBox.right > box.right) {
      scroller.scrollLeft += tabBox.right - box.right;
    }
  };

  reveal();

  const observer = new ResizeObserver(reveal);

  observer.observe(scroller);
  observer.observe(tab);

  return () => observer.disconnect();
}

export function RecordTabs<Tab extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: RecordTabSpec<Tab>[];
  value: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div
      className="w-full min-w-0 shrink-0 no-scrollbar overflow-x-auto overflow-y-hidden pb-1.5"
      data-slot="record-tabs"
    >
      <Tabs
        onValueChange={(next) => {
          const chosen = tabs.find((tab) => tab.id === next);

          if (chosen) onChange(chosen.id);
        }}
        value={value}
      >
        <TabsList className="shadow-none max-lg:gap-6" variant="line">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              ref={tab.id === value ? keepInView : undefined}
              value={tab.id}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
