import React, { useState, useContext } from "react"
import Input from "../../components/Input/Input"
import { useNavigate } from "react-router"
import {registerUser} from "../../lib/user"
import { AuthContext } from "../../hooks/authContext"
import { Link } from "lucide-react"



function Register(){
    const navigate = useNavigate()
    const authContextData = useContext(AuthContext)
    
    const auth = useContext(AuthContext);
    const tenant_id = auth.tenantId;
    
    const [data, setData] = useState({
        email: '',
        password: '',
    })
    const [metaData, setMetaData] = useState({
        cnpj: '',
        nome_empresa: '',
        nome_usuario: ''
    })


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'data' | 'metadata') =>{
        if(type === 'data'){
            setData({...data, [e.target.name]: e.target.value})
        }else{
            setMetaData({...metaData, [e.target.name]: e.target.value})
        }
    }
    
    const submitNewUser = async (e: React.FormEvent) => {
        e.preventDefault()

        setData({
            email: data.email,
            password: data.password
        })

        setMetaData({
            cnpj: metaData.cnpj,
            nome_empresa: metaData.nome_empresa,
            nome_usuario: metaData.nome_usuario
        })

        const register = await registerUser({user: data, metaData: metaData})
        console.log("🚀 ~ submitNewUser ~ register:", register)

        if(register[0]?.id){

            authContextData.setTenantId(register[0].id)

            authContextData.toggleAuth()
            navigate('/dashboard')
        }
    }

    return(
            <main className="bg-gradient-to-r from-blue-800 via-blue-500 to-blue-400 text-gray w-screen h-screen flex flex-col items-center justify-center">

            <h2 className="text-xl font-normal text-gray-300 px-4 text-center">Vamos fazer seu cadastro!</h2>
            {/* <h1 className="text-2xl font-light mb-2 text-gray-300 px-4 text-center">Seja bem vindo ao seu gerenciador de frotas!</h1> */}

            <form action="submit" className="mt-5 text-white w-xs">
                <Input label="Email:" name="email" type="email" value={data.email} onChange={(e) => handleChange(e, 'data') } theme="light" autocomplete="email"/>
                <Input label="Password:" name="password" type="password" value={data.password} onChange={(e) => handleChange(e, 'data') } theme="light" autocomplete="new-password"/>
                <Input label="CNPJ:" name="cnpj" type="text" value={metaData.cnpj} onChange={(e) => handleChange(e, 'metadata') } theme="light" autocomplete="organization"/>
                <Input label="Nome da empresa:" name="nome_empresa" type="text" value={metaData.nome_empresa} onChange={(e) => handleChange(e, 'metadata') } theme="light" autocomplete="organization"/>
                <Input label="Nome do responsável:" name="nome_usuario" type="text" value={metaData.nome_usuario} onChange={(e) => handleChange(e, 'metadata') } theme="light" autocomplete="name"/>


                <div className="flex flex-row justify-between items-center gap-2 pb-5">
                    <p className="text-gray-300 text-sm">Já possui uma conta?</p>
                    <Link to=".../login" className="text-blue-400 text-sm hover:text-blue-600">Faça login</Link>
                </div>

                <button type="submit" className="bg-gray-800 btn p-2 rounded-sm w-full text-gray-300 " onClick={submitNewUser}>
                    Cadastrar-se
                </button>
            </form>
        </main>
    )
}

export default Register