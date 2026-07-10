import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Conditions G\u00e9n\u00e9rales d'Utilisation \u2014 Qalem",
  description:
    "Conditions g\u00e9n\u00e9rales d'utilisation de la plateforme Qalem (AI-Mpower LLC). Loi applicable : droit marocain. Juridiction : Casablanca.",
};

function SectionTitle({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <h2 className="text-2xl font-bold text-[#d5baff] font-[family-name:var(--font-display)] mt-12 mb-4">
      {children}
    </h2>
  );
}

function Paragraph({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return <p className="text-slate-300 leading-relaxed mb-4">{children}</p>;
}

function List({ items }: Readonly<{ items: string[] }>): React.ReactElement {
  return (
    <ul className="list-disc list-inside space-y-2 text-slate-300 mb-4 ml-4">
      {items.map((item) => (
        <li key={item} className="leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function TermsPage(): React.ReactElement {
  return (
    <article className="prose-invert max-w-none">
      {/* Header */}
      <div className="mb-12">
        <span className="inline-block px-4 py-1.5 rounded-full bg-[#722ed1]/10 text-[#d5baff] text-xs font-bold tracking-widest uppercase mb-6 font-[family-name:var(--font-display)]">
          DOCUMENT L&Eacute;GAL
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white font-[family-name:var(--font-display)] tracking-tight mb-4">
          Conditions G&eacute;n&eacute;rales d&apos;Utilisation
        </h1>
        <p className="text-slate-400 text-sm">
          Derni&egrave;re mise &agrave; jour : 31 mars 2026
        </p>
        <div className="w-24 h-1 bg-gradient-to-r from-[#722ed1] to-emerald-400 rounded-full mt-6" />
      </div>

      {/* 1. Objet */}
      <SectionTitle>1. Objet du service</SectionTitle>
      <Paragraph>
        Les pr&eacute;sentes Conditions G&eacute;n&eacute;rales d&apos;Utilisation (ci-apr&egrave;s
        &laquo; CGU &raquo;) r&eacute;gissent l&apos;acc&egrave;s et l&apos;utilisation de la
        plateforme Qalem, &eacute;dit&eacute;e par AI-Mpower LLC (ci-apr&egrave;s
        &laquo; l&apos;&Eacute;diteur &raquo;).
      </Paragraph>
      <Paragraph>
        Qalem est une plateforme de formation interactive qui utilise l&apos;intelligence
        artificielle pour g&eacute;n&eacute;rer des classes immersives multi-agents. Elle permet aux
        formateurs de cr&eacute;er des exp&eacute;riences p&eacute;dagogiques &agrave; partir de
        documents (PDF, sujets libres) et aux apprenants de suivre ces formations de mani&egrave;re
        interactive.
      </Paragraph>
      <Paragraph>
        L&apos;utilisation de la plateforme implique l&apos;acceptation pleine et enti&egrave;re des
        pr&eacute;sentes CGU.
      </Paragraph>

      {/* 2. Inscription et compte */}
      <SectionTitle>2. Inscription et compte utilisateur</SectionTitle>
      <Paragraph>
        L&apos;acc&egrave;s &agrave; la plateforme n&eacute;cessite la cr&eacute;ation d&apos;un
        compte via une adresse e-mail valide ou un fournisseur d&apos;authentification
        tiers.
      </Paragraph>
      <List
        items={[
          'L\u2019utilisateur s\u2019engage \u00e0 fournir des informations exactes et \u00e0 les maintenir \u00e0 jour',
          'Chaque compte est personnel et incessible. L\u2019utilisateur est responsable de la confidentialit\u00e9 de ses identifiants',
          'En cas d\u2019acc\u00e8s non autoris\u00e9 \u00e0 votre compte, vous devez nous en informer imm\u00e9diatement \u00e0 contact@qalem.ma',
          'Nous nous r\u00e9servons le droit de suspendre ou supprimer un compte en cas de violation des pr\u00e9sentes CGU',
        ]}
      />

      {/* 3. Utilisation du service */}
      <SectionTitle>3. Utilisation du service</SectionTitle>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">Droits de l&apos;utilisateur</h3>
      <List
        items={[
          'G\u00e9n\u00e9rer des classes interactives \u00e0 partir de documents ou de sujets libres',
          'Utiliser les agents IA pour l\u2019apprentissage et la r\u00e9vision',
          'Exporter les contenus g\u00e9n\u00e9r\u00e9s (PPTX, PDF) dans le cadre de vos activit\u00e9s de formation',
          'Acc\u00e9der au syst\u00e8me de r\u00e9p\u00e9tition espac\u00e9e (FSRS)',
          'Obtenir des certificats de compl\u00e9tion v\u00e9rifiables',
        ]}
      />
      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        Obligations de l&apos;utilisateur
      </h3>
      <List
        items={[
          'Ne pas utiliser la plateforme \u00e0 des fins illicites, contraires \u00e0 l\u2019ordre public ou aux bonnes m\u0153urs',
          'Ne pas tenter de contourner les mesures de s\u00e9curit\u00e9 ou d\u2019acc\u00e9der aux donn\u00e9es d\u2019autres utilisateurs',
          'Ne pas g\u00e9n\u00e9rer de contenu haineux, discriminatoire ou portant atteinte aux droits de tiers',
          'Ne pas proc\u00e9der \u00e0 du scraping, de l\u2019extraction automatique de donn\u00e9es ou \u00e0 toute utilisation abusive de l\u2019API',
          'Respecter les limites de votre forfait (nombre de formateurs, apprenants, g\u00e9n\u00e9rations)',
        ]}
      />

      {/* 4. Propri&eacute;t&eacute; intellectuelle */}
      <SectionTitle>4. Propri&eacute;t&eacute; intellectuelle</SectionTitle>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">Contenu g&eacute;n&eacute;r&eacute; par l&apos;IA</h3>
      <Paragraph>
        Les contenus p&eacute;dagogiques g&eacute;n&eacute;r&eacute;s par les agents IA de Qalem
        (slides, quiz, scripts) sont mis &agrave; la disposition de l&apos;utilisateur pour un usage
        dans le cadre de ses activit&eacute;s de formation. L&apos;utilisateur peut les modifier,
        exporter et partager librement dans ce contexte.
      </Paragraph>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">Documents t&eacute;l&eacute;vers&eacute;s</h3>
      <Paragraph>
        L&apos;utilisateur conserve l&apos;int&eacute;gralit&eacute; des droits sur les documents
        qu&apos;il t&eacute;l&eacute;verse. En les soumettant &agrave; Qalem, il accorde une
        licence limit&eacute;e, non exclusive et r&eacute;vocable, strictement n&eacute;cessaire au
        traitement technique (analyse, g&eacute;n&eacute;ration de contenu).
      </Paragraph>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">Plateforme et code source</h3>
      <Paragraph>
        Qalem est distribu&eacute; sous licence AGPL-3.0. Le code source est disponible sur GitHub.
        Cette licence ne s&apos;&eacute;tend pas aux donn&eacute;es utilisateur, aux configurations
        sp&eacute;cifiques du d&eacute;ploiement ou aux contenus g&eacute;n&eacute;r&eacute;s.
      </Paragraph>

      {/* 5. Abonnements et paiement */}
      <SectionTitle>5. Abonnements et paiement</SectionTitle>
      <Paragraph>
        Qalem propose plusieurs formules d&apos;abonnement, dont une offre gratuite et des offres
        payantes. Les tarifs sont exprim&eacute;s en dirhams marocains (MAD), toutes taxes
        comprises.
      </Paragraph>
      <List
        items={[
          'Les abonnements sont factur\u00e9s mensuellement ou annuellement selon la formule choisie',
          'Le paiement s\u2019effectue par carte bancaire ou via les moyens de paiement mobile disponibles (Orange Money, Wave, CinetPay)',
          'L\u2019abonnement est renouvel\u00e9 automatiquement sauf r\u00e9siliation avant la date d\u2019\u00e9ch\u00e9ance',
          'Un essai gratuit de 30 jours est propos\u00e9 sur l\u2019offre Pro, sans engagement',
          'Les d\u00e9tails complets des formules sont disponibles sur la page Tarifs',
        ]}
      />
      <Paragraph>
        Consultez les d&eacute;tails complets de nos offres sur la{' '}
        <a href="/pricing" className="text-[#d5baff] hover:underline">
          page Tarifs
        </a>
        .
      </Paragraph>

      {/* 6. Limitation de responsabilit&eacute; */}
      <SectionTitle>6. Limitation de responsabilit&eacute;</SectionTitle>
      <Paragraph>
        Qalem s&apos;efforce de fournir un service de qualit&eacute;, disponible 24h/24 et 7j/7.
        Toutefois :
      </Paragraph>
      <List
        items={[
          'Le service est fourni \u00ab en l\u2019\u00e9tat \u00bb. Nous ne garantissons pas l\u2019absence d\u2019erreurs ou d\u2019interruptions',
          'Les contenus g\u00e9n\u00e9r\u00e9s par l\u2019IA sont propos\u00e9s \u00e0 titre p\u00e9dagogique et ne constituent pas un avis professionnel. Il appartient au formateur de v\u00e9rifier leur exactitude',
          'Nous ne sommes pas responsables des dommages indirects, pertes de donn\u00e9es ou manques \u00e0 gagner r\u00e9sultant de l\u2019utilisation du service',
          'Notre responsabilit\u00e9 totale est limit\u00e9e au montant des sommes vers\u00e9es par l\u2019utilisateur au cours des 12 mois pr\u00e9c\u00e9dant l\u2019\u00e9v\u00e9nement',
          'Pour les instances auto-h\u00e9berg\u00e9es, la responsabilit\u00e9 de la s\u00e9curit\u00e9 et de la disponibilit\u00e9 incombe \u00e0 l\u2019h\u00e9bergeur',
        ]}
      />

      {/* 7. Donn&eacute;es personnelles */}
      <SectionTitle>7. Donn&eacute;es personnelles</SectionTitle>
      <Paragraph>
        Le traitement de vos donn&eacute;es personnelles est r&eacute;gi par notre{' '}
        <a href="/legal/privacy" className="text-[#d5baff] hover:underline">
          Politique de Confidentialit&eacute;
        </a>
        , qui fait partie int&eacute;grante des pr&eacute;sentes CGU. Nous vous invitons &agrave; la
        consulter attentivement.
      </Paragraph>

      {/* 8. R&eacute;siliation */}
      <SectionTitle>8. R&eacute;siliation</SectionTitle>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        &Agrave; l&apos;initiative de l&apos;utilisateur
      </h3>
      <List
        items={[
          'Vous pouvez r\u00e9silier votre abonnement \u00e0 tout moment depuis vos Param\u00e8tres',
          'La r\u00e9siliation prend effet \u00e0 la fin de la p\u00e9riode d\u2019abonnement en cours',
          'Vous pouvez demander la suppression de votre compte et de vos donn\u00e9es via Param\u00e8tres \u2192 Supprimer mon compte',
        ]}
      />
      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        &Agrave; l&apos;initiative de l&apos;&Eacute;diteur
      </h3>
      <List
        items={[
          'Nous pouvons suspendre ou r\u00e9silier un compte en cas de violation des CGU, apr\u00e8s notification par e-mail',
          'En cas de manquement grave (contenu illicite, tentative de piratage), la suspension peut \u00eatre imm\u00e9diate',
          'L\u2019utilisateur pourra r\u00e9cup\u00e9rer ses donn\u00e9es pendant 30 jours apr\u00e8s la r\u00e9siliation',
        ]}
      />

      {/* 9. Loi applicable */}
      <SectionTitle>9. Loi applicable et juridiction</SectionTitle>
      <Paragraph>
        Les pr&eacute;sentes CGU sont r&eacute;gies par le droit marocain. En cas de litige
        relatif &agrave; l&apos;interpr&eacute;tation ou &agrave; l&apos;ex&eacute;cution des
        pr&eacute;sentes, les parties s&apos;engagent &agrave; rechercher une solution amiable dans
        un d&eacute;lai de 30 jours.
      </Paragraph>
      <Paragraph>
        &Agrave; d&eacute;faut de r&eacute;solution amiable, le litige sera soumis &agrave; la
        comp&eacute;tence exclusive des tribunaux de Casablanca, Maroc.
      </Paragraph>

      {/* 10. Contact */}
      <SectionTitle>10. Contact</SectionTitle>
      <Paragraph>Pour toute question relative aux pr&eacute;sentes CGU :</Paragraph>
      <div className="bg-[#131b2e] rounded-xl p-6 border border-slate-700/30 mb-6 space-y-2 text-sm text-slate-300">
        <p>
          <span className="text-slate-500">&Eacute;diteur :</span>{' '}
          <span className="text-slate-200 font-medium">AI-Mpower LLC</span>
        </p>
        <p>
          <span className="text-slate-500">E-mail :</span>{' '}
          <a href="mailto:contact@qalem.ma" className="text-[#d5baff] hover:underline">
            contact@qalem.ma
          </a>
        </p>
        <p>
          <span className="text-slate-500">Si&egrave;ge :</span>{' '}
          <span className="text-slate-200">Casablanca, Maroc</span>
        </p>
      </div>

      {/* 11. Modifications */}
      <SectionTitle>11. Modifications des CGU</SectionTitle>
      <Paragraph>
        Nous nous r&eacute;servons le droit de modifier les pr&eacute;sentes CGU &agrave; tout
        moment. Les modifications seront notifi&eacute;es par e-mail ou via l&apos;application au
        moins 30 jours avant leur entr&eacute;e en vigueur. La poursuite de l&apos;utilisation du
        service apr&egrave;s cette date vaut acceptation des nouvelles conditions.
      </Paragraph>

      {/* Footer */}
      <div className="mt-16 pt-8 border-t border-slate-700/30 text-slate-500 text-xs">
        <p>&copy; 2026 AI-Mpower LLC. Tous droits r&eacute;serv&eacute;s.</p>
      </div>
    </article>
  );
}
