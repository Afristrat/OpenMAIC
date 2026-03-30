'use client';

import { Puzzle, Wrench, BarChart3, Shield, CheckCircle } from 'lucide-react';

export function InstitutionsSection(): React.ReactElement {
  return (
    <section className="py-24 bg-card">
      <div className="max-w-7xl mx-auto px-8">
        {/* Header */}
        <div className="mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold tracking-widest uppercase mb-6 font-[family-name:var(--font-display)]">
            POUR LES INSTITUTIONS
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-[family-name:var(--font-display)] font-extrabold text-foreground tracking-tight leading-tight max-w-4xl mb-6">
            Con&ccedil;u pour les centres de formation et universit&eacute;s
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            LTI 1.3, organisations multi-tenant, reporting pour les accr&eacute;ditations, et
            souverainet&eacute; des donn&eacute;es — tout ce dont votre institution a besoin.
          </p>
        </div>

        {/* Feature Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
          {/* Col 1: Int&eacute;gration LMS */}
          <div className="group">
            <div className="w-14 h-14 rounded-2xl bg-[#722ed1]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <Puzzle className="size-8 text-[#722ed1]" />
            </div>
            <h3 className="text-2xl font-[family-name:var(--font-display)] font-bold text-foreground mb-4">
              Int&eacute;gration LMS
            </h3>
            {/* Mockup */}
            <div className="bg-muted rounded-2xl p-6 shadow-sm border border-border/10 mb-6 overflow-hidden relative">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/10">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <div className="ml-auto text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Moodle Instance
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-border/30 rounded w-3/4" />
                <div className="bg-[#722ed1]/5 rounded-lg p-4 border border-[#722ed1]/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-[#d5baff] flex items-center justify-center text-[#722ed1] font-black">
                      Q
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="h-2 bg-[#722ed1]/20 rounded w-1/2" />
                      <div className="h-2 bg-[#722ed1]/20 rounded w-full" />
                    </div>
                  </div>
                </div>
                <div className="h-4 bg-border/30 rounded w-full" />
              </div>
              <div className="absolute top-2 right-2 translate-x-1/4 -translate-y-1/4">
                <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg transform rotate-12 inline-block">
                  LTI 1.3 Certified
                </span>
              </div>
            </div>
            <h4 className="font-bold text-lg mb-2 text-foreground">
              S&apos;int&egrave;gre dans Moodle en 10 minutes
            </h4>
            <p className="text-muted-foreground text-sm leading-relaxed">
              LTI 1.3 compatible avec tous les LMS. Les notes remontent automatiquement au carnet
              de notes. Z&eacute;ro changement de workflow.
            </p>
          </div>

          {/* Col 2: Organisations */}
          <div className="group">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <Wrench className="size-8 text-blue-500" />
            </div>
            <h3 className="text-2xl font-[family-name:var(--font-display)] font-bold text-foreground mb-4">
              Organisations
            </h3>
            <div className="bg-muted rounded-2xl p-6 shadow-sm border border-border/10 mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-muted-foreground">MEMBRES</span>
                <span className="bg-emerald-400/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Multi-tenant
                </span>
              </div>
              <div className="space-y-3">
                {[
                  { name: 'Ahmed B.', role: 'Admin', roleColor: 'bg-[#722ed1]/10 text-[#722ed1]' },
                  { name: 'Sara L.', role: 'Manager', roleColor: 'bg-blue-500/10 text-blue-500' },
                  {
                    name: 'Karim M.',
                    role: 'Formateur',
                    roleColor: 'bg-amber-500/10 text-amber-500',
                  },
                ].map((member) => (
                  <div
                    key={member.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-card"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-muted" />
                      <span className="text-[11px] font-medium text-foreground">{member.name}</span>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${member.roleColor}`}
                    >
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <h4 className="font-bold text-lg mb-2 text-foreground">
              G&eacute;rez formateurs et apprenants
            </h4>
            <p className="text-muted-foreground text-sm leading-relaxed">
              4 r&ocirc;les (Admin, Manager, Formateur, Apprenant), biblioth&egrave;que
              partag&eacute;e, templates par secteur, invitation par email.
            </p>
          </div>

          {/* Col 3: Reporting */}
          <div className="group">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <BarChart3 className="size-8 text-amber-500" />
            </div>
            <h3 className="text-2xl font-[family-name:var(--font-display)] font-bold text-foreground mb-4">
              Reporting
            </h3>
            <div className="bg-muted rounded-2xl p-6 shadow-sm border border-border/10 mb-6">
              <div className="flex items-end gap-1 mb-4 h-20">
                <div className="w-1/4 bg-border/30 h-12 rounded-t-sm" />
                <div className="w-1/4 bg-border/30 h-16 rounded-t-sm" />
                <div className="w-1/4 bg-primary h-20 rounded-t-sm relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-primary">
                    94%
                  </div>
                </div>
                <div className="w-1/4 bg-border/30 h-10 rounded-t-sm" />
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border/10">
                <div className="text-[10px] font-medium text-muted-foreground">
                  Compliance Audit
                </div>
                <span className="bg-foreground text-background text-[9px] font-bold px-2 py-0.5 rounded">
                  Kirkpatrick L1-L4
                </span>
              </div>
            </div>
            <h4 className="font-bold text-lg mb-2 text-foreground">
              Rapports pr&ecirc;ts pour les audits
            </h4>
            <p className="text-muted-foreground text-sm leading-relaxed">
              M&eacute;triques par apprenant et par formation. Export PDF et CSV. Taux de
              compl&eacute;tion, scores moyens, temps pass&eacute;.
            </p>
          </div>
        </div>

        {/* Data Sovereignty Callout */}
        <div className="mt-24 bg-[#0f172a] rounded-[2rem] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#722ed1]/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px]" />
          <div className="flex flex-col lg:flex-row items-center gap-12 relative z-10">
            {/* Left: Icons */}
            <div className="flex lg:flex-col gap-6 items-center">
              <div className="w-20 h-20 rounded-2xl bg-[#1e293b] flex items-center justify-center border border-slate-700/50 shadow-inner">
                <Shield className="size-10 text-[#d5baff]" />
              </div>
              <div className="w-12 h-8 rounded shadow-md overflow-hidden ring-1 ring-white/10 bg-red-700 flex items-center justify-center text-green-500 text-lg">
                &#9733;
              </div>
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                <CheckCircle className="size-6 text-emerald-400" />
              </div>
            </div>

            {/* Center: Text */}
            <div className="flex-1 text-center lg:text-left">
              <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] font-extrabold mb-4 tracking-tight">
                Vos donn&eacute;es restent chez vous
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
                100% auto-h&eacute;berg&eacute; via Docker. Conforme CNDP et RGPD.
                D&eacute;ploy&eacute; en 15 minutes sur vos serveurs priv&eacute;s ou cloud
                souverain.
              </p>
            </div>

            {/* Right: Comparison */}
            <div className="w-full lg:w-auto space-y-6">
              <div className="flex gap-3 justify-center lg:justify-end">
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2">
                  <CheckCircle className="size-4" /> CNDP
                </span>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2">
                  <CheckCircle className="size-4" /> RGPD
                </span>
              </div>
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-sm">
                <div className="space-y-4 text-sm">
                  {[
                    { name: 'Coursera', status: 'Cloud US', bad: true },
                    { name: 'Khan Academy', status: 'Cloud US', bad: true },
                    { name: 'Qalem', status: 'Vos serveurs', bad: false },
                  ].map((item, i) => (
                    <div
                      key={item.name}
                      className={`flex items-center justify-between gap-8 ${
                        i < 2 ? 'pb-3 border-b border-slate-700/50' : ''
                      }`}
                    >
                      <span className={item.bad ? 'text-slate-400' : 'text-[#d5baff] font-bold'}>
                        {item.name}
                      </span>
                      <span
                        className={
                          item.bad
                            ? 'text-red-400 font-semibold'
                            : 'text-emerald-400 font-bold'
                        }
                      >
                        {item.bad ? '\u274C' : '\u2705'} {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
