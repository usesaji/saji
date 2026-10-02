import GovernanceGate from "@/features/governance/GovernanceGate";

export default function Layout({ children }: { children: React.ReactNode }) {
	return <GovernanceGate>{children}</GovernanceGate>;
}
