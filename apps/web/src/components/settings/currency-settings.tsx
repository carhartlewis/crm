import { rateField } from "@crm/core/money";
import { CURRENCIES } from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm/ui/components/table";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  clearManualRateMutation,
  type CurrencyRate,
  currencyRates,
  saveReportingCurrencyMutation,
  setManualRateMutation,
  useExchangeRates,
  useReportingCurrency,
} from "../../lib/money.ts";
import { calendarDate } from "../../lib/record-format.ts";
import { ChoiceDetail } from "../records/detail-fields.tsx";
import { TextField } from "../text-field.tsx";
import { SettingsCard } from "./settings-card.tsx";

/** Up to six significant digits: `1.08213`, `149.567`. */
const formatRate = (rate: number) =>
  new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(rate);

/**
 * The reporting currency and the rates behind every total (ADR 0024): one card to choose the
 * currency, one table of today's rates where a member can set the workspace's own.
 */
export function CurrencySettings({ workspaceId }: { workspaceId: string }) {
  const reporting = useReportingCurrency(workspaceId);
  const { rates, loading } = useExchangeRates(workspaceId);
  const [editing, setEditing] = useState<CurrencyRate | null>(null);

  const save = useMutation({
    ...saveReportingCurrencyMutation,
    onSuccess: (_, { currency }) => toast.success(`Totals now add up in ${currency}`),
    onError: (error) => toast.error(error.message),
  });

  const clear = useMutation({
    ...clearManualRateMutation,
    onSuccess: (_, { currency }) => toast.success(`${currency} uses the daily rate again`),
    onError: (error) => toast.error(error.message),
  });

  const rows = currencyRates(rates, reporting);

  return (
    <>
      <SettingsCard
        title="Reporting currency"
        description="Pipeline totals add up every deal converted into this currency."
        hint="Changing it converts every open deal again."
      >
        <div className="max-w-xs">
          <ChoiceDetail
            field
            label="Reporting currency"
            onSave={(next) =>
              next && next !== reporting && save.mutate({ workspaceId, currency: next })
            }
            options={CURRENCIES.map((currency) => ({
              value: currency.code,
              label: `${currency.code} · ${currency.name}`,
            }))}
            value={reporting}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Exchange rates"
        description={`What one unit of each currency is worth in ${reporting}. Rates update daily from the European Central Bank; a rate you set wins.`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">{`In ${reporting}`}</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.code}>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-medium tabular-nums">{row.code}</span>
                    <span className="truncate text-muted-foreground">{row.name}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="tabular-nums select-text">
                    {row.rate === null ? (loading ? "…" : "No rate") : formatRate(row.rate)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {row.manual
                      ? "Set by your team"
                      : row.asOf
                        ? `Daily, ${calendarDate(row.asOf) ?? row.asOf}`
                        : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {row.manual ? (
                    <Button
                      loading={clear.isPending && clear.variables.currency === row.code}
                      onClick={() => clear.mutate({ workspaceId, currency: row.code })}
                      size="sm"
                      variant="ghost"
                    >
                      Use daily rate
                    </Button>
                  ) : (
                    <Button onClick={() => setEditing(row)} size="sm" variant="ghost">
                      Set rate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsCard>

      <Dialog onOpenChange={(open) => !open && setEditing(null)} open={editing !== null}>
        <DialogContent>
          {editing ? (
            <ManualRateForm
              key={editing.code}
              onDone={() => setEditing(null)}
              rate={editing}
              reporting={reporting}
              workspaceId={workspaceId}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ManualRateForm({
  workspaceId,
  rate,
  reporting,
  onDone,
}: {
  workspaceId: string;
  rate: CurrencyRate;
  reporting: string;
  onDone: () => void;
}) {
  const formId = useId();

  const set = useMutation({
    ...setManualRateMutation,
    onSuccess: () => {
      toast.success(`${rate.code} rate saved`);
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: { rate: rate.rate === null ? "" : String(Number(rate.rate.toPrecision(6))) },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      await set
        .mutateAsync({ workspaceId, currency: rate.code, rate: value.rate.trim() })
        .catch(() => undefined);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{`Set the ${rate.code} rate`}</DialogTitle>
        <DialogDescription>
          {`Open deals in ${rate.code} are converted at this rate until you go back to the daily one.`}
        </DialogDescription>
      </DialogHeader>
      <form.Field
        name="rate"
        validators={{
          onDynamic: ({ value }) => {
            const result = rateField(value);

            return result.ok ? undefined : result.message;
          },
        }}
      >
        {(field) => (
          <TextField
            field={field}
            inputMode="decimal"
            label={`1 ${rate.code} in ${reporting}`}
            placeholder="1.08"
          />
        )}
      </form.Field>
      <DialogFooter>
        <Button onClick={onDone} type="button" variant="ghost">
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button loading={submitting} type="submit">
              Save rate
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
