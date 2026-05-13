"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { FormFieldType } from "@prisma/client";
import { PortalLogo } from "@/components/portal/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

type Field = {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options: string[] | null;
};

export default function PublicFormPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/forms/public/${token}`);
      if (!res.ok) {
        toast.error("Form not available");
        return;
      }
      const data = (await res.json()) as {
        form: { title: string; description: string | null; fields: Field[] };
      };
      setTitle(data.form.title);
      setDescription(data.form.description);
      setFields(data.form.fields);
    })();
  }, [token]);

  async function submit() {
    const body: Record<string, string> = { ...answers };
    for (const [k, v] of Object.entries(multi)) {
      body[k] = v.join("; ");
    }
    const res = await fetch(`/api/forms/public/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      toast.error(err.error ?? "Submit failed");
      return;
    }
    toast.success("Response recorded");
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-lg overflow-visible shadow-md">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center sm:px-8">
            <PortalLogo className="mx-auto shrink-0" />
            <div className="w-full min-w-0 space-y-3">
              <CardTitle className="text-balance text-xl font-semibold leading-snug">
                Thank you
              </CardTitle>
              <CardDescription className="text-balance text-base leading-relaxed text-muted-foreground">
                Your response has been saved.
              </CardDescription>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-muted/40 p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <PortalLogo />
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              333 Motorsport
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <Card>
          <CardContent className="space-y-5 pt-6">
            {fields.map((f) => (
              <div key={f.id} className="space-y-2">
                <Label>
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.type === "SHORT_TEXT" || f.type === "EMAIL_FIELD" ? (
                  <Input
                    type={f.type === "EMAIL_FIELD" ? "email" : "text"}
                    value={answers[f.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [f.id]: e.target.value }))
                    }
                  />
                ) : null}
                {f.type === "LONG_TEXT" ? (
                  <Textarea
                    rows={4}
                    value={answers[f.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [f.id]: e.target.value }))
                    }
                  />
                ) : null}
                {f.type === "NUMBER" ? (
                  <Input
                    type="number"
                    value={answers[f.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [f.id]: e.target.value }))
                    }
                  />
                ) : null}
                {f.type === "DATE" ? (
                  <Input
                    type="date"
                    value={answers[f.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [f.id]: e.target.value }))
                    }
                  />
                ) : null}
                {f.type === "SINGLE_CHOICE" ? (
                  <div className="space-y-2">
                    {(f.options ?? []).map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={f.id}
                          value={opt}
                          checked={answers[f.id] === opt}
                          onChange={() =>
                            setAnswers((a) => ({ ...a, [f.id]: opt }))
                          }
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : null}
                {f.type === "MULTI_CHOICE" ? (
                  <div className="space-y-2">
                    {(f.options ?? []).map((opt) => {
                      const set = new Set(multi[f.id] ?? []);
                      const checked = set.has(opt);
                      return (
                        <label key={opt} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const on = Boolean(v);
                              setMulti((m) => {
                                const cur = new Set(m[f.id] ?? []);
                                if (on) cur.add(opt);
                                else cur.delete(opt);
                                return { ...m, [f.id]: [...cur] };
                              });
                            }}
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
            <Button className="w-full" onClick={() => void submit()}>
              Submit
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
