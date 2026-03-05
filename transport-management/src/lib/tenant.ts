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
        const {data: newTenant, error} = await supabase
        .from('tenants')
        .insert(data.cnpj)
        .select()
        .single()

        if(error){
            throw new Error('Erro ao cadastrar tenant')
        }

        return newTenant
    }catch(e: any){
        throw new Error(e.message)
    }
}