import Button from "../Button/Button";

interface CardProps{
    id: string;
    title: string;
    details :{
        details: React.ReactNode
    }[];

}

export default function Card(card: CardProps){
    return(
        <section>
            <div className=" bg-gray-50 border border-gray-300 w-full h-full rounded-xl flex flex-col items-start justify-center p-4">
                <div className="py-4     text-gray-800 w-full">
                    <h2 className="font-light text-xl mb-4 flex items-center">
                        {card.title}
                    </h2>
                    {card.details.map(detail => {
                        return(
                            <p className="font-light text-sm flex items-center justify-between">{detail.details}</p>
                        )
                    })}
                </div>

                <div className="flex items-center justify-between w-full gap-2 border-t border-gray-300 py-4">
                    <Button type="primary" to={`/frota/editar?id=${card.id}`} >Editar</Button>
                    <Button type="logout" to={`/frota/remover?id=${card.id}`} >Remover</Button>
                </div>
            </div>
        </section>
    )
}