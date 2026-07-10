import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Politique de Confidentialit\u00e9 \u2014 Qalem',
  description:
    'Politique de confidentialit\u00e9 de Qalem (AI-Mpower LLC). Conformit\u00e9 CNDP (loi 09-08) et RGPD. Protection des donn\u00e9es personnelles.',
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

export default function PrivacyPage(): React.ReactElement {
  return (
    <article className="prose-invert max-w-none">
      {/* Header */}
      <div className="mb-12">
        <span className="inline-block px-4 py-1.5 rounded-full bg-[#722ed1]/10 text-[#d5baff] text-xs font-bold tracking-widest uppercase mb-6 font-[family-name:var(--font-display)]">
          DOCUMENT L&Eacute;GAL
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white font-[family-name:var(--font-display)] tracking-tight mb-4">
          Politique de Confidentialit&eacute;
        </h1>
        <p className="text-slate-400 text-sm">
          Derni&egrave;re mise &agrave; jour : 31 mars 2026
        </p>
        <div className="w-24 h-1 bg-gradient-to-r from-[#722ed1] to-emerald-400 rounded-full mt-6" />
      </div>

      {/* Introduction */}
      <Paragraph>
        La pr&eacute;sente Politique de Confidentialit&eacute; d&eacute;crit la mani&egrave;re dont
        AI-Mpower LLC (ci-apr&egrave;s &laquo; nous &raquo;, &laquo; notre &raquo; ou
        &laquo; Qalem &raquo;) collecte, utilise, conserve et prot&egrave;ge vos donn&eacute;es
        personnelles lorsque vous utilisez la plateforme Qalem (accessible via qalem.ma et ses
        sous-domaines).
      </Paragraph>
      <Paragraph>
        Cette politique est conforme &agrave; la loi marocaine n&deg; 09-08 relative &agrave; la
        protection des personnes physiques &agrave; l&apos;&eacute;gard du traitement des
        donn&eacute;es &agrave; caract&egrave;re personnel, ainsi qu&apos;au R&egrave;glement
        G&eacute;n&eacute;ral sur la Protection des Donn&eacute;es (RGPD) europ&eacute;en.
      </Paragraph>

      {/* 1. Donn&eacute;es collect&eacute;es */}
      <SectionTitle>1. Donn&eacute;es collect&eacute;es</SectionTitle>
      <Paragraph>
        Nous collectons les cat&eacute;gories de donn&eacute;es suivantes :
      </Paragraph>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        Donn&eacute;es d&apos;identification
      </h3>
      <List
        items={[
          'Adresse e-mail',
          'Nom et pr\u00e9nom (facultatif)',
          'Photo de profil (facultatif)',
          'Identifiants de connexion (hash\u00e9s)',
        ]}
      />
      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        Donn&eacute;es d&apos;apprentissage
      </h3>
      <List
        items={[
          'Historique des classes interactives g\u00e9n\u00e9r\u00e9es et suivies',
          'R\u00e9ponses aux quiz et \u00e9valuations',
          'Scores de r\u00e9p\u00e9tition espac\u00e9e (FSRS)',
          'Documents t\u00e9l\u00e9vers\u00e9s (PDF, supports de cours)',
          'Interactions avec les agents IA (historique de chat)',
        ]}
      />
      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        Donn&eacute;es techniques
      </h3>
      <List
        items={[
          'Adresse IP',
          'Type de navigateur et syst\u00e8me d\u2019exploitation',
          'Pages consult\u00e9es et dur\u00e9e des sessions',
          'Donn\u00e9es de t\u00e9l\u00e9m\u00e9trie anonymis\u00e9es (avec votre consentement)',
        ]}
      />

      {/* 2. Finalit&eacute; du traitement */}
      <SectionTitle>2. Finalit&eacute; du traitement</SectionTitle>
      <Paragraph>Vos donn&eacute;es sont trait&eacute;es pour les finalit&eacute;s suivantes :</Paragraph>
      <List
        items={[
          'Fournir et personnaliser l\u2019exp\u00e9rience de formation interactive',
          'G\u00e9n\u00e9rer des classes interactives adapt\u00e9es \u00e0 votre niveau',
          'Alimenter le syst\u00e8me de r\u00e9p\u00e9tition espac\u00e9e (FSRS) pour optimiser la r\u00e9tention',
          'Am\u00e9liorer la qualit\u00e9 p\u00e9dagogique des agents IA',
          '\u00C9mettre des certificats de compl\u00e9tion v\u00e9rifiables',
          'G\u00e9rer votre compte et vos abonnements',
          'Assurer la s\u00e9curit\u00e9 et la disponibilit\u00e9 du service',
          'R\u00e9pondre \u00e0 vos demandes de support',
        ]}
      />

      {/* 3. Base l&eacute;gale */}
      <SectionTitle>3. Base l&eacute;gale du traitement</SectionTitle>
      <Paragraph>
        Nos traitements reposent sur les bases l&eacute;gales suivantes :
      </Paragraph>
      <List
        items={[
          'Consentement : pour la collecte de donn\u00e9es de t\u00e9l\u00e9m\u00e9trie, l\u2019utilisation de cookies non essentiels et l\u2019envoi de communications marketing',
          'Ex\u00e9cution du contrat : pour la fourniture du service de formation, la gestion du compte et le traitement des paiements',
          'Int\u00e9r\u00eat l\u00e9gitime : pour l\u2019am\u00e9lioration du service, la s\u00e9curit\u00e9 de la plateforme et la pr\u00e9vention des abus',
          'Obligation l\u00e9gale : pour la conservation des donn\u00e9es de facturation et la r\u00e9ponse aux r\u00e9quisitions judiciaires',
        ]}
      />

      {/* 4. Dur&eacute;e de conservation */}
      <SectionTitle>4. Dur&eacute;e de conservation</SectionTitle>
      <Paragraph>
        Nous conservons vos donn&eacute;es selon les dur&eacute;es suivantes :
      </Paragraph>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="py-3 pr-4 text-slate-400 font-semibold">Cat&eacute;gorie</th>
              <th className="py-3 text-slate-400 font-semibold">Dur&eacute;e</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            <tr className="border-b border-slate-800">
              <td className="py-3 pr-4">Donn&eacute;es de compte</td>
              <td className="py-3">Dur&eacute;e de l&apos;abonnement + 12 mois</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-3 pr-4">Donn&eacute;es d&apos;apprentissage</td>
              <td className="py-3">Dur&eacute;e de l&apos;abonnement + 6 mois</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-3 pr-4">Donn&eacute;es de facturation</td>
              <td className="py-3">10 ans (obligation l&eacute;gale)</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-3 pr-4">Donn&eacute;es techniques / logs</td>
              <td className="py-3">12 mois</td>
            </tr>
            <tr>
              <td className="py-3 pr-4">Cookies de session</td>
              <td className="py-3">Dur&eacute;e de la session</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Paragraph>
        &Agrave; l&apos;expiration de ces dur&eacute;es, vos donn&eacute;es sont supprim&eacute;es
        ou anonymis&eacute;es de mani&egrave;re irr&eacute;versible.
      </Paragraph>

      {/* 5. Droits des utilisateurs */}
      <SectionTitle>5. Droits des utilisateurs</SectionTitle>
      <Paragraph>
        Conform&eacute;ment &agrave; la loi 09-08 et au RGPD, vous disposez des droits suivants :
      </Paragraph>
      <List
        items={[
          'Droit d\u2019acc\u00e8s : obtenir une copie de vos donn\u00e9es personnelles',
          'Droit de rectification : corriger des donn\u00e9es inexactes ou incompl\u00e8tes',
          'Droit de suppression : demander l\u2019effacement de vos donn\u00e9es',
          'Droit \u00e0 la portabilit\u00e9 : recevoir vos donn\u00e9es dans un format structur\u00e9 (JSON/CSV)',
          'Droit d\u2019opposition : refuser certains traitements fond\u00e9s sur l\u2019int\u00e9r\u00eat l\u00e9gitime',
          'Droit \u00e0 la limitation : suspendre temporairement le traitement de vos donn\u00e9es',
          'Droit de retrait du consentement : retirer votre consentement \u00e0 tout moment',
        ]}
      />
      <Paragraph>
        Pour exercer ces droits, envoyez un e-mail &agrave;{' '}
        <a href="mailto:dpo@qalem.ma" className="text-[#d5baff] hover:underline">
          dpo@qalem.ma
        </a>
        . Nous r&eacute;pondrons dans un d&eacute;lai de 30 jours. La fonctionnalit&eacute;
        d&apos;export de donn&eacute;es est &eacute;galement disponible directement depuis votre
        profil (Param&egrave;tres &rarr; Exporter mes donn&eacute;es).
      </Paragraph>

      {/* 6. Cookies */}
      <SectionTitle>6. Cookies et technologies similaires</SectionTitle>
      <Paragraph>Qalem utilise les cookies et technologies suivantes :</Paragraph>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">Cookies essentiels</h3>
      <List
        items={[
          'Authentification et gestion de session',
          'Pr\u00e9f\u00e9rences linguistiques (FR/AR/EN)',
          'Th\u00e8me d\u2019affichage (clair/sombre)',
        ]}
      />
      <h3 className="text-lg font-semibold text-slate-100 mb-2">Cookies optionnels</h3>
      <List
        items={[
          'T\u00e9l\u00e9m\u00e9trie de performance (avec consentement explicite)',
          'Stockage local IndexedDB pour le mode hors-ligne (PWA)',
        ]}
      />
      <Paragraph>
        Qalem n&apos;utilise aucun cookie publicitaire ni aucun traceur tiers &agrave; des fins de
        ciblage marketing. La banni&egrave;re de consentement aux cookies vous permet de
        param&eacute;trer vos pr&eacute;f&eacute;rences &agrave; tout moment.
      </Paragraph>

      {/* 7. Transferts internationaux */}
      <SectionTitle>7. Transferts internationaux</SectionTitle>
      <Paragraph>
        Qalem est con&ccedil;u pour &ecirc;tre auto-h&eacute;berg&eacute; sur vos propres
        serveurs. Dans le cas o&ugrave; vous utilisez l&apos;instance cloud g&eacute;r&eacute;e par
        Qalem :
      </Paragraph>
      <List
        items={[
          'Les donn\u00e9es sont h\u00e9berg\u00e9es sur des serveurs situ\u00e9s en Europe (Railway EU) ou au Maroc selon votre choix',
          'Les appels aux fournisseurs d\u2019IA (g\u00e9n\u00e9ration de contenu, synth\u00e8se vocale) peuvent impliquer un transfert temporaire vers les serveurs du fournisseur choisi (configurable)',
          'Aucune donn\u00e9e personnelle d\u2019apprentissage n\u2019est transmise aux fournisseurs d\u2019IA \u2014 seul le contenu p\u00e9dagogique g\u00e9n\u00e9r\u00e9 est concern\u00e9',
        ]}
      />
      <Paragraph>
        Pour les instances auto-h&eacute;berg&eacute;es, vous gardez un contr&ocirc;le total sur
        la localisation de vos donn&eacute;es.
      </Paragraph>

      {/* 8. Contact DPO */}
      <SectionTitle>8. D&eacute;l&eacute;gu&eacute; &agrave; la Protection des Donn&eacute;es</SectionTitle>
      <Paragraph>Pour toute question relative &agrave; la protection de vos donn&eacute;es :</Paragraph>
      <div className="bg-[#131b2e] rounded-xl p-6 border border-slate-700/30 mb-6 space-y-2 text-sm text-slate-300">
        <p>
          <span className="text-slate-500">Responsable :</span>{' '}
          <span className="text-slate-200 font-medium">AI-Mpower LLC</span>
        </p>
        <p>
          <span className="text-slate-500">E-mail :</span>{' '}
          <a href="mailto:dpo@qalem.ma" className="text-[#d5baff] hover:underline">
            dpo@qalem.ma
          </a>
        </p>
        <p>
          <span className="text-slate-500">Adresse :</span>{' '}
          <span className="text-slate-200">Casablanca, Maroc</span>
        </p>
      </div>

      {/* 9. Conformit&eacute; */}
      <SectionTitle>9. Conformit&eacute; CNDP et RGPD</SectionTitle>
      <Paragraph>
        Qalem s&apos;engage &agrave; respecter les dispositions de la loi marocaine n&deg; 09-08
        relative &agrave; la protection des personnes physiques &agrave; l&apos;&eacute;gard du
        traitement des donn&eacute;es &agrave; caract&egrave;re personnel, supervis&eacute;e par la
        Commission Nationale de contr&ocirc;le de la protection des Donn&eacute;es &agrave;
        caract&egrave;re Personnel (CNDP).
      </Paragraph>
      <Paragraph>
        Pour les utilisateurs situ&eacute;s dans l&apos;Espace &Eacute;conomique Europ&eacute;en,
        nous respectons &eacute;galement le R&egrave;glement G&eacute;n&eacute;ral sur la
        Protection des Donn&eacute;es (RGPD - R&egrave;glement UE 2016/679).
      </Paragraph>
      <Paragraph>
        En cas de litige, vous pouvez adresser une r&eacute;clamation &agrave; la CNDP
        (www.cndp.ma) ou &agrave; l&apos;autorit&eacute; de protection des donn&eacute;es de votre
        pays de r&eacute;sidence.
      </Paragraph>

      {/* 10. Modifications */}
      <SectionTitle>10. Modifications de cette politique</SectionTitle>
      <Paragraph>
        Nous nous r&eacute;servons le droit de modifier cette politique &agrave; tout moment. Toute
        modification substantielle vous sera notifi&eacute;e par e-mail ou via une notification dans
        l&apos;application au moins 30 jours avant son entr&eacute;e en vigueur. La date de
        derni&egrave;re mise &agrave; jour est indiqu&eacute;e en haut de cette page.
      </Paragraph>

      {/* Footer */}
      <div className="mt-16 pt-8 border-t border-slate-700/30 text-slate-500 text-xs">
        <p>&copy; 2026 AI-Mpower LLC. Tous droits r&eacute;serv&eacute;s.</p>
      </div>
    </article>
  );
}
