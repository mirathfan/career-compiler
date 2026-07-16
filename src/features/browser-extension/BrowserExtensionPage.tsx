import { ExternalLink, Plug, ShieldCheck, TestTube2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";

const steps = [
  "Build or load the extension from apps/careercompiler-extension.",
  "Open Chrome extensions, enable Developer mode, and load the dist folder unpacked.",
  "Use the extension popup to scan a local fixture or a real application form.",
  "Review highlighted fields and submit manually in the browser.",
];

export function BrowserExtensionPage() {
  return (
    <div>
      <PageHeader eyebrow="Autofill bridge" title="Browser Extension" />
      <div className="space-y-5 p-8">
        <section className="panel p-5">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-1 text-emerald-700" size={22} aria-hidden="true" />
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Manual submission enforced</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                The extension scans, classifies, fills, and highlights fields. It does not click final submit buttons,
                call form submission APIs, solve CAPTCHAs, or bypass application controls.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-5">
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Plug size={18} aria-hidden="true" />
              <h3 className="font-semibold text-slate-950">Development workflow</h3>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p><code>npm run extension:build</code></p>
              <p><code>chrome://extensions</code></p>
              <p><code>apps/careercompiler-extension/dist</code></p>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
              {steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <TestTube2 size={18} aria-hidden="true" />
              <h3 className="font-semibold text-slate-950">Current support</h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">Generic HTML forms</div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">Greenhouse fixtures</div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">Lever fixtures</div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">Ashby fixtures</div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">Native messaging host pending</div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">Workday future adapter</div>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-start gap-4">
            <ExternalLink className="mt-1 text-blue-700" size={20} aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-slate-950">Security boundary</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                The extension bundle contains no OpenAI key and no candidate database. The first release uses a strict
                message schema and a bridge client abstraction; production native messaging registration is documented
                in <code>docs/extension-setup.md</code>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
