import supabase from "../supabase/supabase"

export const getSession = async () =>{
    const {data, error} = await supabase.auth.getSession()
    if(error) throw new Error("Não foi possível validar a sessão.")
    return data
}
