import supabase from "../supabase/supabase"

interface dataTenant{
    email?: string,
    password?: string,
    cnpj?: string,
    nome_empresa?: string,
    nome_usuario?: string
}

export const registerTenant = async(data: dataTenant) => {
    try{
        console.log("🚀 ~ registerTenant ~ data:", data)

        const {data: newTenant, error} = await supabase
        .from('tenants')
        .insert(data)
        .select()

        if(error){
            throw new Error(error.message)
        }

        return newTenant
    }catch( e: any){
        console.log("🚀 ~ registerTenant error ~ e:", e)
        throw new Error(e.message)
    }
}