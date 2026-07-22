import { TransmissionViewer } from '@/components/transmissions/transmission-viewer';

export default async function TransmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TransmissionViewer id={id} />;
}
