interface CardProps{
    id: string;
    title: string;
    details :{
        details: React.ReactNode
    }[];
    className?: string;
    actions?: ({label: string; onClick: () => void; disabled?: boolean; danger?: boolean} | false)[];
}

export default function Card(card: CardProps){
    return(
        <section className={card.className}>
            <div className=" bg-gray-50 border border-gray-300 w-full h-full rounded-sm flex flex-col items-start justify-center p-4">
                <div className="py-4     text-gray-800 w-full">
                        <h2 className="min-w-0 break-words font-bold text-xl mb-4 flex items-center">
                        {card.title}
                    </h2>
                    {card.details.map((detail, index) => {
                        return(
                            <p key={index} className="min-w-0 break-words font-medium text-sm flex items-center justify-between">{detail.details}</p>
                        )
                    })}
                </div>

                {card.actions?.some(Boolean) && <div className="flex items-center justify-between w-full gap-2 border-t border-gray-300 py-4">
                    {card.actions?.filter((action) => action !== false).map((action, index) => action && (
                        <button key={index} disabled={action.disabled} onClick={action.onClick}
                            className={`w-full rounded-lg p-2 disabled:opacity-50 ${action.danger ? "bg-red-600 text-white" : "bg-blue-600 text-white"}`}>
                            {action.label}
                        </button>
                    ))}
                </div>}
            </div>
        </section>
    )
}
